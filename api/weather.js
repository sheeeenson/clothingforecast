const API_KEY = process.env.YOUR_VERCEL_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

const candidActions = [
  'performing a dynamic floorwork move on a city street',
  'leaping gracefully through the air like a ballet dancer on a sidewalk',
  'striking a dramatic, abstract dance pose against a brick wall',
  'doing a series of fast-paced, fluid movements as if in a dance battle',
  'holding a stylized, impossible freeze-frame pose like a statue',
  'executing a powerful spin with arms outstretched',
  'recreating a classic pose from a modern dance performance',
  'balancing on one leg with exaggerated posture as if on a stage',
  'crouching low to the ground with a powerful, coiled pose',
  'throwing their head back in an expression of pure, uninhibited motion'
];

const getRandomAction = () => {
  return candidActions[Math.floor(Math.random() * candidActions.length)];
};

const generatePrompt = (temp, thermoType, description, city, gender, style, occasion) => {
  const action = getRandomAction();
  let genderWord;
  switch (gender) {
    case 'male': genderWord = 'man'; break;
    case 'female': genderWord = 'woman'; break;
    default: genderWord = 'person';
  }

  let styleWords = '';
  switch(style) {
    case 'casual': styleWords = 'super stylish, fashion-forward, casual'; break;
    case 'business': styleWords = 'elegant, sophisticated, business-casual'; break;
    case 'evening': styleWords = 'chic, high-fashion, evening-wear'; break;
    case 'sporty': styleWords = 'athletic, comfortable, urban sportswear'; break;
  }

  let occasionWords = '';
  switch(occasion) {
    case 'city walk': occasionWords = 'on a city street'; break;
    case 'cafe evening': occasionWords = 'inside a cozy cafe'; break;
    case 'date night': occasionWords = 'in a romantic restaurant'; break;
    case 'active leisure': occasionWords = 'at a dynamic sports location'; break;
  }
  
  let prompt = `a candid, photojournalistic style photo of a stylish ${genderWord} with a big, joyful smile, looking directly at the camera while ${action} ${occasionWords} in ${city}, full body shot, wearing a ${styleWords} outfit like from Pinterest`;
  if (description.includes('дождь') || description.includes('ливень')) prompt += ', overcast and raining, wet pavement, holding an umbrella';
  else if (description.includes('снег') || temp < -5) prompt += ', a snowy city street, cold and wintry day';
  else if (temp > 25) prompt += ', a sunny summer day';
  else if (temp > 15) prompt += ', a warm, pleasant day';
  else if (temp > 5) prompt += ', a cool, crisp autumn day';
  else prompt += ', a chilly winter day';

  if (temp < 0) prompt += ', wearing a thick winter coat, scarf, hat, and gloves';
  else if (temp >= 0 && temp < 10) {
    if (thermoType === 'hot') prompt += ', wearing a light jacket over a sweater';
    else if (thermoType === 'normal') prompt += ', wearing a warm jacket, beanie, and a scarf';
    else prompt += ', wearing a very thick winter jacket and multiple layers';
  } else if (temp >= 10 && temp < 20) {
    if (thermoType === 'hot') prompt += ', wearing a light windbreaker or cardigan';
    else if (thermoType === 'normal') prompt += ', wearing a sweater or hoodie';
    else prompt += ', wearing a warm jacket';
  } else if (temp >= 20 && temp < 25) {
    if (thermoType === 'hot') prompt += ', wearing a t-shirt and shorts';
    else prompt += ', wearing a long-sleeve shirt and jeans';
  } else prompt += ', wearing light summer clothing, shorts and a t-shirt';

  return prompt + ', high-quality photograph, realistic, detailed, cinematic lighting, ultra-realistic';
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { lat, lon, thermoType, gender, style, occasion } = req.body;

    // 1. Fetch weather data
    const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=ru`);
    const weatherData = await weatherRes.json();
    if (weatherData.cod !== 200) {
      throw new Error(weatherData.message || 'Error fetching weather data.');
    }

    // 2. Generate image prompt
    const prompt = generatePrompt(weatherData.main.temp, thermoType, weatherData.weather[0].description, weatherData.name, gender, style, occasion);

    // 3. Fetch image from Gemini API
    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=' + API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModality: ['TEXT', 'IMAGE'] },
        })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
        throw new Error(geminiData?.error?.message || 'Error generating image.');
    }

    const base64Image = geminiData.candidates[0].content.parts[0].inlineData.data;

    res.status(200).json({ weatherData, outfitImage: base64Image });

  } catch (error) {
    console.error('API Handler Error:', error);
    res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
  }
};

