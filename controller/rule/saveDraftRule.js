const pool = require('../../db');

async function saveDraftRule(req, res) {
  let client;
  try {
    const { rule_group_id } = req.params;
    const { draft_id, name, description, json_rule, event, parameters, tags } = req.body;

    if (!name || !json_rule) {
      return res.status(400).json({ message: 'Name and JSON rule are required.' });
    }
    if (req.user.role !== 'maker') {
      return res.status(403).json({ message: 'Only Makers can save drafts.' });
    }

    // 👇 Merge full rule object before saving
    const fullRuleObject = {
      ...json_rule,           // contains 'conditions'
      event: event || {},     // add event if provided
      parameters: parameters || [],
      tags: tags || []
    };

    client = await pool.connect();
    await client.query('BEGIN');

    let draftIdToUse = draft_id;

    if (draftIdToUse) {
      // Update existing draft
      const updateDraftQuery = `
        UPDATE rule_drafts
        SET rule_group_id = $1, name = $2, description = $3, json_rule = $4, submission_status = 'drafted',
            updated_by = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING id
      `;
      const updateDraftValues = [rule_group_id, name, description || null, JSON.stringify(fullRuleObject), req.user.username, draftIdToUse];
      const updateResult = await client.query(updateDraftQuery, updateDraftValues);

      if (updateResult.rowCount === 0) {
        throw new Error('Draft not found for update');
      }

      // Delete old parameter & tag mappings
      await client.query('DELETE FROM rule_parameter_draft_map WHERE rule_draft_id = $1', [draftIdToUse]);
      await client.query('DELETE FROM rule_tag_draft_map WHERE rule_draft_id = $1', [draftIdToUse]);
    } else {
      // Insert new draft
      const insertDraftQuery = `
        INSERT INTO rule_drafts (rule_group_id, name, description, json_rule, submission_status, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'drafted', $5, $5, NOW(), NOW())
        RETURNING id
      `;
      const insertDraftValues = [rule_group_id, name, description || null, JSON.stringify(fullRuleObject), req.user.username];
      const insertResult = await client.query(insertDraftQuery, insertDraftValues);
      draftIdToUse = insertResult.rows[0].id;
    }

    // Handle parameters
    if (parameters && parameters.length > 0) {
      const dataTypeMapping = {
        STRING: 'STRING',
        NUMBER: 'INT',
        FLOAT: 'FLOAT',
        BOOLEAN: 'BOOLEAN',
        DATE: 'DATE'
      };

      for (const param of parameters) {
        const dbDataType = dataTypeMapping[param.data_type];
        if (!dbDataType) {
          throw new Error(`Invalid data_type: ${param.data_type}. Valid values are: ${Object.keys(dataTypeMapping).join(', ')}`);
        }

        const paramDraftQuery = `
          INSERT INTO rule_parameter_drafts (name, data_type, description, is_required, default_value, created_by, updated_by, created_at, updated_at)
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

        const paramDraftValues = [
          param.name,
          dbDataType,
          param.description || '',
          param.is_required || false,
          param.default_value || null,
          req.user.username
        ];

        const paramDraftResult = await client.query(paramDraftQuery, paramDraftValues);
        const paramDraftId = paramDraftResult.rows[0].id;

        const paramMapDraftQuery = `
          INSERT INTO rule_parameter_draft_map (rule_draft_id, parameter_draft_id, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, $3, NOW(), NOW())
          ON CONFLICT DO NOTHING
        `;

        await client.query(paramMapDraftQuery, [draftIdToUse, paramDraftId, req.user.username]);
      }
    }

    // Handle tags
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        const tagDraftQuery = `
          INSERT INTO rule_tags_drafts (name, description, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, $3, NOW(), NOW())
          ON CONFLICT (name) DO UPDATE SET
            description = EXCLUDED.description,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
          RETURNING id
        `;

        const tagDraftValues = [tag.name, tag.description || '', req.user.username];
        const tagDraftResult = await client.query(tagDraftQuery, tagDraftValues);
        const tagDraftId = tagDraftResult.rows[0].id;

        const tagMapDraftQuery = `
          INSERT INTO rule_tag_draft_map (rule_draft_id, tag_draft_id, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, $3, NOW(), NOW())
          ON CONFLICT DO NOTHING
        `;

        await client.query(tagMapDraftQuery, [draftIdToUse, tagDraftId, req.user.username]);
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Draft saved successfully.', draft_id: draftIdToUse });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return res.status(500).json({ message: 'Internal server error.', details: error.message });
  } finally {
    if (client) client.release();
  }
}

module.exports = { saveDraftRule };
