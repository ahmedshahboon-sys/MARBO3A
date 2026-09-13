INSERT INTO admin_system_settings(key,value,description) VALUES
 ('maintenance_mode','false'::jsonb,'Automatic deploy maintenance mode'),
 ('maintenance_message',to_jsonb('جاري تحديث مربوعة، بنرجعولك خلال دقائق.'::text),'User-facing maintenance message'),
 ('maintenance_eta_minutes','15'::jsonb,'Approximate deploy maintenance duration in minutes'),
 ('maintenance_started_at','null'::jsonb,'Timestamp for the current automatic maintenance window')
ON CONFLICT(key) DO NOTHING;
