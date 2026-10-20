-- Índice por token en sesiones_activas (2026-10-20). verifyToken consulta esta tabla en cada petición
-- para rechazar sesiones cerradas o revocadas. Aditiva e idempotente: solo crea el índice si falta.
-- Prefijo de 191 caracteres: token es TEXT; la comparación completa se hace sobre las pocas filas que coinciden.
SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones_activas' AND INDEX_NAME = 'idx_sesiones_token');
SET @sql = IF(@falta = 0, 'CREATE INDEX `idx_sesiones_token` ON `sesiones_activas` (`token`(191))', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
