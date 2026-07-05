-- Migration: Add school_classes table and school_class_id to users
-- Tabel kelas khusus untuk mode sekolah, terpisah dari departments

-- 1. Buat tabel school_classes
CREATE TABLE IF NOT EXISTS school_classes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    org_id      INT NOT NULL,
    name        VARCHAR(255) NOT NULL,
    grade       VARCHAR(20)  NULL,
    major       VARCHAR(100) NULL,
    homeroom_teacher VARCHAR(255) NULL,
    description TEXT         NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sc_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tambah kolom school_class_id ke tabel users
ALTER TABLE users
    ADD COLUMN school_class_id INT NULL AFTER department_id,
    ADD COLUMN parent_name     VARCHAR(255) NULL AFTER parent_phone,
    ADD CONSTRAINT fk_user_school_class
        FOREIGN KEY (school_class_id) REFERENCES school_classes(id) ON DELETE SET NULL;

SELECT 'Migration completed: school_classes table created, school_class_id added to users' AS status;
