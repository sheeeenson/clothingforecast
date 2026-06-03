const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.YOUR_VERCEL_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

const candidActions = [
  'walking confidently across a modern city street',
  'standing near a crosswalk with a relaxed natural pose',
  'leaving a cozy cafe and smiling at the camera',
  'adjusting their jacket while walking through the city',
  'holding a coffee cup and looking effortlessly stylish',
  'crossing a sunny boulevard with natural movement',
  'standing under soft street light with a calm confident pose',
  'walking through a park path with a relaxed candid expression'
];

const getRandomAction = () => candidActions[Math.floor(Math.random() * candidActions.length)];

const dictionaries = {
  gender: {
    male: 'man',
    female: 'woman',
    any: 'person'
  },
  style: {
    casual: 'modern casual, wearable, effortless everyday style',
    business: 'smart business casual, polished but not formal, refined office style',
    evening: 'elevated evening style, chic, elegant, city-ready',
    sporty: 'urban sporty style, comfortable, athletic-inspired, clean silhouette',
    minimal: 'minimalist style, neutral tones, clean lines, premium basics',
    streetwear: 'contemporary streetwear, layered, expressive, fashion-forward'
  },
  occasion: {
    'city walk': 'for a city walk',
    'office day': 'for a workday in the city',
    'cafe evening': 'for an evening in a cozy cafe',
    'date night': 'for a date night',
    'active leisure': 'for active leisure outdoors'
  },
  thermo: {
    cold: 'the person tends to feel cold, so the outfit should be slightly warmer and layered',
    normal: 'the person has average temperature sensitivity, so the outfit should match the weather accurately',
    hot: 'the person tends to feel hot, so the outfit should be a little lighter while still weather-appropriate'
  }
};

const getWeatherContext = ({ temp, feelsLike, description, windSpeed }) => {
  const lowerDescription = String(description || '').toLowerCase();
  const contexts = [];

  if (lowerDescription.includes('дожд') || lowerDescription.includes('ливень') || lowerDescription.includes('rain')) {
    contexts.push('rainy weather, wet pavement, practical rain-friendly styling, umbrella or water-resistant outerwear');
  }

  if (lowerDescription.includes('снег') || lowerDescription.includes('snow') || temp < -3) {
    contexts.push('cold wintry weather, warm outerwear, scarf or beanie, insulated shoes');
  } else if (temp >= -3 && temp < 7) {
    contexts.push('cold weather, warm coat or padded jacket, visible layering');
  } else if (temp >= 7 && temp < 15) {
    contexts.push('cool transitional weather, jacket, trench, overshirt, knitwear or hoodie layers');
  } else if (temp >= 15 && temp < 22) {
    contexts.push('mild pleasant weather, light jacket, cardigan, shirt, denim or relaxed layers');
  } else if (temp >= 22 && temp < 28) {
    contexts.push('warm weather, breathable outfit, light fabrics, comfortable shoes');
  } else {
    contexts.push('hot summer weather, very light breathable clothes, sun-ready styling');
  }

  if (typeof windSpeed === 'number' && windSpeed >= 6) {
    contexts.push('noticeable wind, avoid overly loose impractical pieces, add a wind-friendly layer');
  }

  if (typeof feelsLike === 'number' && Math.abs(feelsLike - temp) >= 3) {
    contexts.push(`the weather feels like ${Math.round(feelsLike)}°C even though the temperature is ${Math.round(temp)}°C`);
  }

  return contexts.join(', ');
};

const generatePrompt = ({ temp, feelsLike, description, city, windSpeed, thermoType, gender, style, occasion }) => {
  const action = getRandomAction();
  const genderWord = dictionaries.gender[gender] || dictionaries.gender.any;
  const styleWords = dictionaries.style[style] || dictionaries.style.casual;
  const occasionWords = dictionaries.occasion[occasion] || dictionaries.occasion['city walk'];
  const thermoWords = dictionaries.thermo[thermoType] || dictionaries.thermo.normal;
  const weatherContext = getWeatherContext({ temp, feelsLike, description, windSpeed });

  return [
    `Full-body realistic editorial street style photograph of a stylish ${genderWord}`,
    `${action} in ${city}`,
    `${occasionWords}`,
    `outfit style: ${styleWords}`,
    `weather context: ${weatherContext}`,
    `personal temperature preference: ${thermoWords}`,
    'the outfit must look practical for the current weather and easy to copy in real life',
    'clear view of clothes and shoes, natural pose, premium fashion magazine quality',
    'realistic human proportions, natural face, no text, no logos, no brand names, no extra limbs',
    'soft cinematic daylight, high detail, vertical composition, clean background'
  ].join(', ');
};

const getBase64ImageFromGemini = geminiData => {
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(part => part?.inlineData?.data);
  return imagePart?.inlineData?.data || null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!OPENWEATHER_API_KEY) {
    return res.status(500).json({ error: 'OPENWEATHER_API_KEY is not configured.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
  }

  try {
    const { lat, lon, thermoType = 'normal', gender = 'any', style = 'casual', occasion = 'city walk' } = req.body || {};

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat and lon must be numbers.' });
    }

    const weatherUrl = new URL('https://api.openweathermap.org/data/2.5/weather');
    weatherUrl.searchParams.set('lat', String(lat));
    weatherUrl.searchParams.set('lon', String(lon));
    weatherUrl.searchParams.set('appid', OPENWEATHER_API_KEY);
    weatherUrl.searchParams.set('units', 'metric');
    weatherUrl.searchParams.set('lang', 'ru');

    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    if (!weatherRes.ok || weatherData.cod !== 200) {
      throw new Error(weatherData.message || 'Error fetching weather data.');
    }

    const prompt = generatePrompt({
      temp: weatherData.main.temp,
      feelsLike: weatherData.main.feels_like,
      description: weatherData.weather?.[0]?.description,
      city: weatherData.name || 'the city',
      windSpeed: weatherData.wind?.speed,
      thermoType,
      gender,
      style,
      occasion
    });

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      throw new Error(geminiData?.error?.message || 'Error generating image.');
    }

    const base64Image = getBase64ImageFromGemini(geminiData);

    if (!base64Image) {
      throw new Error('Gemini did not return an image. Try generating again.');
    }

    return res.status(200).json({
      weatherData,
      outfitImage: base64Image,
      prompt
    });
  } catch (error) {
    console.error('API Handler Error:', error);
    return res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
  }
}
