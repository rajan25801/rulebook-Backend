const db = require('../../db');

async function storeRuleEvent(eventType, ruleId, data, metadata, client = db) {
  const eventRes = await client.query(
    `INSERT INTO rule_events (
            event_type, aggregate_id, event_data, metadata, sequence_number
        ) VALUES (
            $1, $2, $3, $4,
            (SELECT COALESCE(MAX(sequence_number), 0) + 1 
             FROM rule_events 
             WHERE aggregate_id = $2)
        ) RETURNING *`,
    [eventType, ruleId, JSON.stringify(data), JSON.stringify(metadata)]
  );
  return eventRes.rows[0];
}

module.exports = { storeRuleEvent };
