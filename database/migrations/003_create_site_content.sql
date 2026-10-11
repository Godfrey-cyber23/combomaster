ALTER TABLE users
    MODIFY role ENUM('client', 'coach', 'admin') NOT NULL DEFAULT 'client';

CREATE TABLE site_content_catalogs (
    page_key VARCHAR(80) PRIMARY KEY,
    initialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_content (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    page_key VARCHAR(80) NOT NULL,
    kind ENUM('block', 'override', 'product', 'meal_plan') NOT NULL,
    target_key VARCHAR(120) NULL,
    title VARCHAR(160) NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    image_url VARCHAR(2048) NULL,
    category VARCHAR(32) NULL,
    unit VARCHAR(120) NULL,
    price VARCHAR(40) NULL,
    details JSON NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_by INT UNSIGNED NULL,
    updated_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_site_content_page_published (page_key, is_published, sort_order),
    INDEX idx_site_content_page_kind (page_key, kind),
    CONSTRAINT fk_site_content_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_site_content_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
