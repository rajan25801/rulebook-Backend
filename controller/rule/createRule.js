const pool = require('../../db');

async function createRule(req, res) {
  let client;
  try {
    const { draft_id } = req.params;

    if (!draft_id) {
      return res.status(400).json({ message: 'Draft ID is required to submit the rule.' });
    }

    if (req.user.role !== 'maker') {
      return res.status(403).json({ message: 'Only Makers can submit rules.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // Fetch draft rule
    const draftQuery = `
      SELECT * FROM rule_drafts 
      WHERE id = $1 AND submission_status = 'drafted'
    `;
    const draftResult = await client.query(draftQuery, [draft_id]);
    if (draftResult.rowCount === 0) {
      throw new Error('Draft not found or already submitted.');
    }

    const draftRule = draftResult.rows[0];

    // Insert new rule
    const insertRuleQuery = `
      INSERT INTO rules 
      (rule_group_id, name, description, json_rule, status, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'PENDING', $5, $5, NOW(), NOW())
      RETURNING id
    `;
    const insertRuleValues = [
      draftRule.rule_group_id,
      draftRule.name,
      draftRule.description,
      draftRule.json_rule,
      req.user.username
    ];
    const ruleInsertResult = await client.query(insertRuleQuery, insertRuleValues);
    const ruleId = ruleInsertResult.rows[0].id;

    // --- Parameters ---
    const paramMapQuery = `
      SELECT rp.* FROM rule_parameter_draft_map rmap
      JOIN rule_parameter_drafts rp ON rmap.parameter_draft_id = rp.id
      WHERE rmap.rule_draft_id = $1
    `;
    const paramMapResult = await client.query(paramMapQuery, [draft_id]);

    const dataTypeMapping = {
      STRING: 'STRING',
      INT: 'INT',
      INTEGER: 'INT',
      NUMBER: 'INT',
      FLOAT: 'FLOAT',
      BOOLEAN: 'BOOLEAN',
      DATE: 'DATE'
    };

    for (const param of paramMapResult.rows) {
      const dbDataType = dataTypeMapping[param.data_type];
      if (!dbDataType) {
        throw new Error(`Invalid data_type: ${param.data_type}`);
      }

      const upsertParamQuery = `
        INSERT INTO rule_parameters
        (name, data_type, description, is_required, default_value, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET
          data_type = EXCLUDED.data_type,
          description = EXCLUDED.description,
          is_required = EXCLUDED.is_required,
          default_value = EXCLUDED.default_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING id
      `;
      const paramRes = await client.query(upsertParamQuery, [
        param.name,
        dbDataType,
        param.description || '',
        param.is_required || false,
        param.default_value || null,
        req.user.username
      ]);

      const paramId = paramRes.rows[0].id;

      await client.query(`
        INSERT INTO rule_parameter_map (rule_id, parameter_id, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $3, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [ruleId, paramId, req.user.username]);
    }

    // --- Tags ---
    const tagMapQuery = `
      SELECT rt.* FROM rule_tag_draft_map rmap
      JOIN rule_tags_drafts rt ON rmap.tag_draft_id = rt.id
      WHERE rmap.rule_draft_id = $1
    `;
    const tagMapResult = await client.query(tagMapQuery, [draft_id]);

    for (const tag of tagMapResult.rows) {
      const upsertTagQuery = `
        INSERT INTO rule_tags (name, description, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $3, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING id
      `;
      const tagRes = await client.query(upsertTagQuery, [
        tag.name,
        tag.description || '',
        req.user.username
      ]);

      const tagId = tagRes.rows[0].id;

      await client.query(`
        INSERT INTO rule_tags_map (rule_id, tag_id, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $3, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [ruleId, tagId, req.user.username]);
    }

    // --- Mark draft as submitted ---
    await client.query(`
      UPDATE rule_drafts
      SET submission_status = 'submitted', updated_by = $2, updated_at = NOW()
      WHERE id = $1
    `, [draft_id, req.user.username]);

    await client.query('COMMIT');
    return res.status(201).json({
      message: 'Rule submitted successfully and is pending approval.',
      rule_id: ruleId
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return res.status(500).json({
      message: 'Internal server error.',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
}

module.exports = { createRule };
