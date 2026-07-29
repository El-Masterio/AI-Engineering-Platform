-- 0009_agent_definitions (down)

DROP TRIGGER IF EXISTS trg_agent_definitions_no_delete ON agent_definitions;
DROP TRIGGER IF EXISTS trg_agent_definitions_immutable ON agent_definitions;
DROP POLICY  IF EXISTS tenant_isolation ON agent_definitions;
DROP TABLE   IF EXISTS agent_definitions;
DROP FUNCTION IF EXISTS app_agent_definitions_no_delete();
DROP FUNCTION IF EXISTS app_agent_definitions_immutable();
