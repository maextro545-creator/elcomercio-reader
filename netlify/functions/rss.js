exports.handler = async function(event, context) {
  try {
    const response = await fetch('https://elcomercio.pe/arcio/rss/');
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Error fetching RSS' })
      };
    }
    const xml = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'max-age=300'
      },
      body: xml
    };
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: error.message })
    };
  }
};
