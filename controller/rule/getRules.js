const db = require('../../db');

async function getRules(req, res) {
  const { rule_group_id } = req.params;
  const { page = 1, limit = 10, search = '', version } = req.query;
  if (!rule_group_id) {
    return res.status(400).json({ error: 'Missing rule_group_id' });
  }
  if (isNaN(page) || isNaN(limit) || page <= 0 || limit <= 0) {
    return res.status(400).json({ error: 'Invalid page or limit parameter' });
  }
  try {
    const offset = (page - 1) * limit;
    const queryParams = [rule_group_id, `%${search}%`, limit, offset];
    const query = `
      WITH base_rules AS (
        SELECT 
          r.id           AS rule_id,
          r.name         AS rule_name,
          r.description  AS rule_description,
          r.json_rule,
          r.version,
          r.status,
          r.is_active,
          r.is_latest,
          r.created_by,
          r.updated_by,
          r.created_by_tool,
          r.updated_by_tool,
          r.created_at,
          r.updated_at,
          rg.name        AS rule_group_name,
          rg.execution_type AS rule_group_execution_type
        FROM rules r
        JOIN rule_groups rg ON r.rule_group_id = rg.id
        WHERE r.rule_group_id = $1
          AND r.is_active = TRUE
          AND r.is_latest = TRUE
          AND r.status IN ('APPROVED', 'REJECTED', 'PENDING')
          AND r.name ILIKE $2
          ${version ? 'AND r.version = $5' : ''}
      ),
      parameters AS (
        SELECT 
          rpm.rule_id,
          json_agg(json_build_object(
            'id', rp.id,
            'name', rp.name,
            'data_type', rp.data_type,
            'description', rp.description,
            'is_required', rp.is_required,
            'default_value', rp.default_value
          )) AS params
        FROM rule_parameter_map rpm
        JOIN rule_parameters rp ON rpm.parameter_id = rp.id
        WHERE rpm.rule_id = ANY((SELECT rule_id FROM base_rules))
        GROUP BY rpm.rule_id
      ),
      tags AS (
        SELECT
          rtm.rule_id,
          json_agg(json_build_object(
            'name', rt.name,
            'description', rt.description
          )) AS tags
        FROM rule_tags_map rtm
        JOIN rule_tags rt ON rtm.tag_id = rt.id
        WHERE rtm.rule_id = ANY((SELECT rule_id FROM base_rules))
        GROUP BY rtm.rule_id
      )
      SELECT
        br.*,
        COALESCE(p.params, '[]') AS parameters,
        COALESCE(t.tags, '[]') AS tags
      FROM base_rules br
      LEFT JOIN parameters p ON br.rule_id = p.rule_id
      LEFT JOIN tags t ON br.rule_id = t.rule_id
      ORDER BY br.created_at DESC
      LIMIT $3 OFFSET $4`;
    if (version) {
      queryParams.push(parseInt(version));
    }
    const result = await db.query(query, queryParams);
    const rules = result.rows.map(rule => ({
      id: rule.rule_id,
      name: rule.rule_name,
      description: rule.rule_description,
      json_rule: rule.json_rule,
      version: rule.version,
      status: rule.status,
      is_active: rule.is_active,
      is_latest: rule.is_latest,
      created_by: rule.created_by,
      updated_by: rule.updated_by,
      created_by_tool: rule.created_by_tool,
      updated_by_tool: rule.updated_by_tool,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
      rule_group: {
        name: rule.rule_group_name,
        execution_type: rule.rule_group_execution_type
      },
      parameters: rule.parameters,
      tags: rule.tags
    }));
    if (rules.length === 0) {
      return res.status(404).json({
        error: 'No rules found',
        details: version
          ? `No rules found for version ${version} in group ${rule_group_id}`
          : `No rules found in group ${rule_group_id}`
      });
    }
    return res.status(200).json({
      page,
      limit,
      total: result.rowCount,
      version: version || 'all',
      rules
    });
  } catch (err) {
    console.error('Error fetching rules:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

module.exports = { getRules };
