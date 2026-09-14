INSERT INTO admin_system_settings(key,value,description)
VALUES ('site_font','"readex"'::jsonb,'Global UI font: readex or cairo')
ON CONFLICT(key) DO NOTHING;
