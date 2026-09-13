INSERT INTO rooms(name,slug,description,is_public)
VALUES
  ('مربوعة العامة','general','تعرف على ناس جدد وشارك الحديث',TRUE),
  ('شباب ليبيا','libya-youth','دردشة ومواضيع يومية',TRUE),
  ('هوايات وتقنية','tech-hobbies','تقنية، ألعاب، سيارات وهوايات',TRUE)
ON CONFLICT(slug) DO NOTHING;
