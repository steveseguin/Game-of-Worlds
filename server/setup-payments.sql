-- Payment System Database Schema
-- Run this after the main setup.js to add payment functionality

USE game;

-- Payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    stripe_id VARCHAR(100) NOT NULL,
    amount INT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    type VARCHAR(20) DEFAULT 'one_time',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    metadata JSON,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_stripe_id (stripe_id),
    INDEX idx_user_status (user_id, status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User currencies table
CREATE TABLE IF NOT EXISTS user_currencies (
    user_id INT PRIMARY KEY,
    premium_crystals INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User boosters table
CREATE TABLE IF NOT EXISTS user_boosters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    effect VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_effect (user_id, effect),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Battle pass ownership table
CREATE TABLE IF NOT EXISTS battle_pass_ownership (
    user_id INT NOT NULL,
    season INT NOT NULL,
    level INT DEFAULT 1,
    xp INT DEFAULT 0,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, season),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User cosmetics table
CREATE TABLE IF NOT EXISTS user_cosmetics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_item (user_id, item_id),
    UNIQUE KEY unique_user_item (user_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- VIP memberships table
CREATE TABLE IF NOT EXISTS vip_memberships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tier VARCHAR(20) NOT NULL,
    stripe_subscription_id VARCHAR(100),
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NOT NULL,
    auto_renew BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_tier (user_id, tier),
    INDEX idx_end_date (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment logs for security and debugging
CREATE TABLE IF NOT EXISTS payment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    product_id VARCHAR(50),
    status VARCHAR(50),
    details JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment disputes table
CREATE TABLE IF NOT EXISTS payment_disputes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    transaction_id INT NOT NULL,
    stripe_dispute_id VARCHAR(100),
    reason VARCHAR(100),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (transaction_id) REFERENCES payment_transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product catalog (optional - can be managed in code)
CREATE TABLE IF NOT EXISTS product_catalog (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price INT NOT NULL,
    currency VARCHAR(3) DEFAULT 'usd',
    category VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Crystal transaction log
CREATE TABLE IF NOT EXISTS crystal_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    balance_after INT NOT NULL,
    transaction_type VARCHAR(50),
    reference_id VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add payment columns to users table if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS lifetime_spent DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_tier VARCHAR(20) DEFAULT 'free',
ADD INDEX IF NOT EXISTS idx_stripe_customer (stripe_customer_id);

-- Create view for user payment summary
CREATE OR REPLACE VIEW user_payment_summary AS
SELECT 
    u.id as user_id,
    u.username,
    u.payment_tier,
    u.lifetime_spent,
    COALESCE(uc.premium_crystals, 0) as crystal_balance,
    COALESCE(vm.tier, 'none') as vip_tier,
    vm.end_date as vip_expires,
    COUNT(DISTINCT pt.id) as total_purchases,
    MAX(pt.created_at) as last_purchase_date
FROM users u
LEFT JOIN user_currencies uc ON u.id = uc.user_id
LEFT JOIN vip_memberships vm ON u.id = vm.user_id AND vm.end_date > NOW()
LEFT JOIN payment_transactions pt ON u.id = pt.user_id AND pt.status = 'completed'
GROUP BY u.id;

-- Insert default products (optional)
INSERT IGNORE INTO product_catalog (id, name, price, category) VALUES
('race_quantum', 'Quantum Entities Race', 499, 'race'),
('race_titan', 'Titan Lords Race', 499, 'race'),
('race_shadow', 'Shadow Realm Race', 499, 'race'),
('crystals_500', '500 Premium Crystals', 499, 'currency'),
('crystals_1200', '1200 Premium Crystals', 999, 'currency'),
('crystals_2500', '2500 Premium Crystals', 1999, 'currency'),
('crystals_6500', '6500 Premium Crystals', 4999, 'currency'),
('vip_bronze', 'Bronze VIP Membership', 499, 'subscription'),
('vip_silver', 'Silver VIP Membership', 999, 'subscription'),
('vip_gold', 'Gold VIP Membership', 1999, 'subscription');

-- Create stored procedures for common operations

DELIMITER //

-- Procedure to grant crystals
CREATE PROCEDURE IF NOT EXISTS grant_crystals(
    IN p_user_id INT,
    IN p_amount INT,
    IN p_reason VARCHAR(100)
)
BEGIN
    DECLARE v_balance INT DEFAULT 0;
    
    -- Get current balance
    SELECT COALESCE(premium_crystals, 0) INTO v_balance
    FROM user_currencies WHERE user_id = p_user_id;
    
    -- Update or insert balance
    INSERT INTO user_currencies (user_id, premium_crystals)
    VALUES (p_user_id, p_amount)
    ON DUPLICATE KEY UPDATE premium_crystals = premium_crystals + p_amount;
    
    -- Log transaction
    INSERT INTO crystal_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (p_user_id, p_amount, v_balance + p_amount, 'grant', p_reason);
END//

-- Procedure to process VIP daily rewards
CREATE PROCEDURE IF NOT EXISTS process_vip_daily_rewards()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_user_id INT;
    DECLARE v_tier VARCHAR(20);
    DECLARE v_crystals INT;
    DECLARE cur CURSOR FOR 
        SELECT user_id, tier FROM vip_memberships 
        WHERE end_date > NOW() AND DATE(last_daily_claim) < CURDATE();
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN cur;
    
    read_loop: LOOP
        FETCH cur INTO v_user_id, v_tier;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Determine crystal amount based on tier
        CASE v_tier
            WHEN 'bronze' THEN SET v_crystals = 10;
            WHEN 'silver' THEN SET v_crystals = 25;
            WHEN 'gold' THEN SET v_crystals = 50;
            ELSE SET v_crystals = 0;
        END CASE;
        
        -- Grant crystals
        IF v_crystals > 0 THEN
            CALL grant_crystals(v_user_id, v_crystals, CONCAT('VIP ', v_tier, ' daily reward'));
            
            -- Update last claim date
            UPDATE vip_memberships 
            SET last_daily_claim = NOW() 
            WHERE user_id = v_user_id AND tier = v_tier;
        END IF;
    END LOOP;
    
    CLOSE cur;
END//

DELIMITER ;

-- Add indexes for performance
ALTER TABLE payment_transactions ADD INDEX idx_user_created (user_id, created_at);
ALTER TABLE crystal_transactions ADD INDEX idx_type (transaction_type);

-- Create triggers for data integrity

DELIMITER //

-- Update lifetime spent on successful payment
CREATE TRIGGER IF NOT EXISTS update_lifetime_spent
AFTER UPDATE ON payment_transactions
FOR EACH ROW
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE users 
        SET lifetime_spent = lifetime_spent + (NEW.amount / 100),
            last_payment_date = NOW()
        WHERE id = NEW.user_id;
        
        -- Update payment tier based on lifetime spent
        UPDATE users 
        SET payment_tier = CASE
            WHEN lifetime_spent >= 100 THEN 'whale'
            WHEN lifetime_spent >= 50 THEN 'dolphin'
            WHEN lifetime_spent >= 10 THEN 'minnow'
            ELSE 'paid'
        END
        WHERE id = NEW.user_id;
    END IF;
END//

DELIMITER ;