const db = require('../../db');
const jsonpath = require('jsonpath');

async function fetchPathData(req, res) {
  const { factName, path } = req.body;
  if (!factName || !path) {
    return res.status(400).json({ error: 'Fact name and path are required.' });
  }
  try {
    // Demo implementation for fetchFactDataFromSource
    const facts = {
      loanAdditionalInfos: { PRE_PAYMENT_ENABLED: 'false' },
      loanProductAdditionalInfo: { PRE_PAYMENT_ENABLED: 'true' },
      env: 'qa',
      lenderId: '3',
      userProfile: { id: 1, name: 'Alice', roles: ['admin'] }
    };
    const factData = facts[factName];
    if (!factData) {
      return res.status(404).json({ error: `Fact "${factName}" not found.` });
    }
    if (!path.startsWith('$')) {
      return res.status(400).json({ error: 'Invalid path format. JSONPath must start with "$".' });
    }
    const result = jsonpath.query(factData, path);
    if (result.length === 0) {
      return res.status(404).json({ error: `Path "${path}" not found in fact "${factName}".` });
    }
    return res.json({ data: result });
  } catch (error) {
    console.error('Error fetching path data:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { fetchPathData };
