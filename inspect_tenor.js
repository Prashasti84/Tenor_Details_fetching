const axios = require('axios');

async function run() {
  const key = process.env.TENOR_API_KEY || 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
  const query = process.argv[2] || '@google';
  const type = process.argv[3];

  try {
    const res = await axios.get('https://tenor.googleapis.com/v2/search', {
      params: {
        key,
        q: query,
        limit: 1,
        ...(type ? { type } : {})
      }
    });

    console.log(JSON.stringify(res.data.results?.[0] || {}, null, 2));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

run();

