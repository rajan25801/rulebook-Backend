const { Engine } = require('json-rules-engine');

function registerDynamicFacts(engine) {
  engine.addFact('loanAdditionalInfos', async(params, almanac) => {
    return { PRE_PAYMENT_ENABLED: 'false' };
  });
  engine.addFact('loanProductAdditionalInfo', async(params, almanac) => {
    return { PRE_PAYMENT_ENABLED: 'true' };
  });
  engine.addFact('env', async(params, almanac) => {
    return 'qa';
  });
  engine.addFact('lenderId', async(params, almanac) => {
    return '3';
  });
}

async function evaluateRuleWithDynamicFacts(req, res) {
  try {
    const { rules, facts } = req.body;
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ error: 'Rules array is required.' });
    }
    const engine = new Engine();
    registerDynamicFacts(engine);
    for (const rule of rules) {
      engine.addRule(rule);
    }
    const { events } = await engine.run(facts || {});
    return res.json({ events });
  } catch (error) {
    console.error('Error evaluating rules with dynamic facts:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { evaluateRuleWithDynamicFacts };
