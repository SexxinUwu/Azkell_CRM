# Etiquetadora del almacén (CBX T40 / HPRT HT400, USB)

Este programa va en **la PC del almacén que tiene la etiquetadora conectada por USB**. Recoge las etiquetas que mandan los usuarios desde
**Inventario › Imprimir** y las imprime. No necesita driver ni permisos de administrador, y no abre puertos: solo consulta al servidor de Azkell.

## Instalación (una sola vez, en la PC del almacén)

1. Instalar **Node.js** (versión LTS) desde nodejs.org.
2. Copiar la carpeta `agente-etiquetas` a la PC.
3. En el sistema: **Sistema › API y desarrolladores**, crear una llave con el permiso **Etiquetadora del almacén**.
4. Copiar `config.ejemplo.json` como `config.json` y completar:
   - `servidor`: la dirección de la empresa (por ejemplo `https://marsisa.azkell.com`).
   - `clave`: la llave creada en el paso 3.
5. Hacer doble clic en `iniciar-agente.bat` y dejar la ventana abierta (minimizada). Debe decir «Agente de etiquetas de Azkell».
6. Para que arranque solo al prender la PC: poner un acceso directo a `iniciar-agente.bat` en la carpeta de Inicio de Windows (`Win + R` → `shell:startup`).

## Uso

En Inventario, abrir un artículo → **Imprimir** → elegir la cantidad → **Imprimir**. Las etiquetas salen de **3 en 3**.
La ventana indica si la etiquetadora del almacén está conectada. Si no lo está, hay que abrir el programa en la PC del almacén.

## Si algo falla

- **«La etiquetadora del almacén no está conectada»**: el programa no está abierto en la PC del almacén, o esa PC no tiene internet.
- **El programa dice «No se encontró la etiquetadora por USB»**: revisar que esté encendida y con el cable USB.
- **Sale en blanco**: revisar el papel. Estas etiquetas son térmicas directas (sin cinta).
- **Medidas**: están en `src/modules/almacen/etiquetasZpl.ts` (`MEDIDAS_ETIQUETA`): 3 etiquetas por fila de unos 32 × 25 mm.
