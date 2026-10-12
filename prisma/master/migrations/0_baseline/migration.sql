-- CreateTable
CREATE TABLE `empresas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(50) NOT NULL,
    `nombre_empresa` VARCHAR(150) NOT NULL,
    `ruc` VARCHAR(20) NULL,
    `db_name` VARCHAR(100) NOT NULL,
    `db_host` VARCHAR(150) NULL,
    `estado` ENUM('activo', 'suspendido', 'demo') NULL DEFAULT 'activo',
    `plan` VARCHAR(50) NULL DEFAULT 'Profesional',
    `max_unidades` INTEGER NULL DEFAULT 100,
    `admin_email` VARCHAR(150) NULL,
    `fecha_creacion` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `slug`(`slug`),
    UNIQUE INDEX `db_name`(`db_name`),
    INDEX `idx_slug`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

