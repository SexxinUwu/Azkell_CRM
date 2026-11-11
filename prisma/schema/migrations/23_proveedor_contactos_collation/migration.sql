-- La tabla de contactos debe tener la misma collation que proveedores_inv (utf8mb4_0900_ai_ci) para poder compararse por proveedor_id. Idempotente.
ALTER TABLE `proveedor_contactos` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
