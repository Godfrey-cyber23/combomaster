CREATE TABLE shop_orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tx_ref CHAR(36) NOT NULL UNIQUE,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(254) NOT NULL,
    customer_phone VARCHAR(32) NULL,
    payment_method ENUM('card', 'mobile') NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'ZMW',
    amount DECIMAL(12,2) NOT NULL,
    items JSON NOT NULL,
    status ENUM('pending', 'successful', 'failed') NOT NULL DEFAULT 'pending',
    flutterwave_transaction_id VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_shop_orders_status_created (status, created_at),
    INDEX idx_shop_orders_flutterwave_transaction (flutterwave_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
