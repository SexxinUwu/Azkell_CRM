-- Contactos de proveedor (2026-11-11). Aditiva e idempotente: solo crea una tabla nueva, no toca datos existentes.
-- Un proveedor (un RUC) puede tener varios contactos (asesores) con su teléfono y correo.

CREATE TABLE IF NOT EXISTS `proveedor_contactos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `proveedor_id` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `cargo` VARCHAR(100) NULL,
  `telefono` VARCHAR(30) NULL,
  `email` VARCHAR(150) NULL,
  `principal` TINYINT(1) NOT NULL DEFAULT 0,
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_prov_contacto` (`proveedor_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
