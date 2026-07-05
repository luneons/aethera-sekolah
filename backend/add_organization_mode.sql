-- Migration: Add organization_mode to organizations table
-- This allows switching between school and office modes

-- Add organization_mode column
ALTER TABLE organizations 
ADD COLUMN organization_mode ENUM('school', 'office') NOT NULL DEFAULT 'office' 
AFTER timezone;

-- Update existing organizations to office mode (default)
UPDATE organizations SET organization_mode = 'office' WHERE organization_mode IS NULL;

-- Optional: Set specific organizations to school mode if needed
-- UPDATE organizations SET organization_mode = 'school' WHERE name LIKE '%Sekolah%' OR name LIKE '%School%';

SELECT 'Migration completed: organization_mode column added' AS status;
