-- quick_tasks holds the user's task templates: name it that way.
ALTER TABLE quick_tasks RENAME TO templates;
ALTER INDEX idx_quick_tasks_user_id RENAME TO idx_templates_user_id;
ALTER TRIGGER update_quick_tasks_updated_at ON templates RENAME TO update_templates_updated_at;
ALTER TABLE templates RENAME CONSTRAINT quick_tasks_pkey TO templates_pkey;
ALTER TABLE templates RENAME CONSTRAINT quick_tasks_user_id_fkey TO templates_user_id_fkey;
