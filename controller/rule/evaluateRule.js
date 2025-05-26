const db = require('../../db');
const pool = require('../../db');
const { Engine } = require('json-rules-engine');

async function evaluateRule(req, res) {
  const { loanDetails } = req.body;
  const ruleGroupId = req.ruleGroupId;
  if (!Array.isArray(loanDetails) || loanDetails.length === 0) {
    return res.status(400).json({ error: 'loanDetails must be a non-empty array' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const traceIdResult = await client.query('SELECT gen_random_uuid() as trace_id');
    const trace_id = traceIdResult.rows[0].trace_id;
    const rulesQuery = `
      SELECT r.id, r.name, r.json_rule, r.version, r.priority, rg.execution_type
      FROM rules r
      JOIN rule_groups rg ON r.rule_group_id = rg.id
      WHERE r.is_latest = true
        AND r.status = 'APPROVED'
        AND rg.is_active = true
        AND r.rule_group_id = $1
    `;
    const ruleRes = await client.query(rulesQuery, [ruleGroupId]);
    if (ruleRes.rowCount === 0) {
      return res.status(404).json({ error: 'No active rules found for the rule group' });
    }
    const ruleIds = ruleRes.rows.map(r => r.id);
    const tagsRes = await client.query(
      'SELECT rtm.rule_id, rt.name FROM rule_tags_map rtm JOIN rule_tags rt ON rtm.tag_id = rt.id WHERE rtm.rule_id = ANY($1)',
      [ruleIds]
    );
    const paramsRes = await client.query(
      'SELECT rpm.rule_id, rp.name, rp.default_value FROM rule_parameter_map rpm JOIN rule_parameters rp ON rpm.parameter_id = rp.id WHERE rpm.rule_id = ANY($1)',
      [ruleIds]
    );
    const tagsMap = {};
    tagsRes.rows.forEach(row => {
      if (!tagsMap[row.rule_id]) tagsMap[row.rule_id] = [];
      tagsMap[row.rule_id].push(row.name);
    });
    const paramsMap = {};
    paramsRes.rows.forEach(row => {
      if (!paramsMap[row.rule_id]) paramsMap[row.rule_id] = {};
      paramsMap[row.rule_id][row.name] = row.default_value;
    });
    let rules = ruleRes.rows;
    rules = rules.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
    const executionType = rules[0].execution_type;
    const results = [];
    for (const loan of loanDetails) {
      let matchedRule = null;
      let finalResult = false;
      let matchedEvent = null;
      let matchedFacts = null;
      for (const rule of rules) {
        const facts = {
          ...loan,
          tags: tagsMap[rule.id] || [],
          parameters: paramsMap[rule.id] || {}
        };
        if (!facts.loanAdditionalInfos) facts.loanAdditionalInfos = {};
        if (!facts.loanProductAdditionalInfo) facts.loanProductAdditionalInfo = {};
        if (paramsMap[rule.id]) {
          if (paramsMap[rule.id].PRE_PAYMENT_ENABLED !== undefined) {
            if (facts.loanAdditionalInfos.PRE_PAYMENT_ENABLED === undefined) {
              facts.loanAdditionalInfos.PRE_PAYMENT_ENABLED = paramsMap[rule.id].PRE_PAYMENT_ENABLED;
            }
            if (facts.loanProductAdditionalInfo.PRE_PAYMENT_ENABLED === undefined) {
              facts.loanProductAdditionalInfo.PRE_PAYMENT_ENABLED = paramsMap[rule.id].PRE_PAYMENT_ENABLED;
            }
          }
        }
        try {
          const engine = new Engine();
          engine.addRule(typeof rule.json_rule === 'string' ? JSON.parse(rule.json_rule) : rule.json_rule);
          const { events } = await engine.run(facts);
          await client.query(
            `INSERT INTO rule_evaluation_logs (
              rule_id, rule_group_id, input_payload, result, evaluated_by,
              trace_id, version, created_by, updated_by, created_by_tool, 
              updated_by_tool, action_type, action_value
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'system', 'system', $9, $10)`,
            [
              rule.id,
              ruleGroupId,
              JSON.stringify(facts),
              events.length > 0,
              'system',
              trace_id,
              rule.version,
              0,
              events.length > 0 ? events[0].type : null,
              events.length > 0 ? JSON.stringify(events[0].params) : null
            ]
          );
          if (events.length > 0) {
            matchedRule = rule;
            matchedEvent = events[0];
            finalResult = true;
            matchedFacts = facts;
            break;
          }
        } catch (err) {
          continue;
        }
      }
      if (finalResult && matchedRule && matchedEvent) {
        const event = { ...matchedEvent };
        if (
          event.params &&
          event.params.razorpayMid === 'LENDER_ID_DYNAMIC' &&
          matchedFacts &&
          matchedFacts.lenderId
        ) {
          event.params.razorpayMid = matchedFacts.lenderId;
        }
        results.push({
          // result: true,
          // rule: matchedRule.name,
          // event,
          // trace_id,
          // json_rule: matchedRule.json_rule,
          status: event.params.status || {}
        });
      } else {
        results.push({
          // result: false,
          // trace_id,
          // alert: true,
          alert: 'No rule matched for the provided input. Please review the input or rules.'
        });
      }
    }
    await client.query('COMMIT');
    return res.status(200).json({ evaluations: results });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { evaluateRule };
