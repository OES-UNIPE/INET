# Aplicaciones ETP

Página de acceso unificada a cuatro aplicaciones web de información y análisis de la Educación Técnico Profesional.

## Aplicaciones

1. **Mapa de Institucionalización COPETyP** (`consejos/`)
2. **Mapa de Institucionalización de PP** (`practicas-profesionalizantes/`)
3. **Aplicación de muestreo ETP** (`muestreo/`)
4. **Resultados del relevamiento de Prácticas Profesionalizantes** (`resultados-relevamiento/`)

Cada aplicación es autocontenida y conserva sus propios estilos, scripts, imágenes y datos. La portada utiliza exclusivamente los recursos ubicados en `assets/`.

## Ejecución local

Debido al uso de módulos ES y carga de datos mediante `fetch`, el repositorio debe servirse mediante HTTP. Por ejemplo:

```text
python -m http.server 8000
```

Luego se puede abrir `http://localhost:8000/`.

## Estructura

```text
INET/
├── index.html
├── assets/                         # Recursos exclusivos de la portada
├── consejos/                       # Mapa de Institucionalización COPETyP
├── practicas-profesionalizantes/   # Mapa de Institucionalización de PP
├── muestreo/                       # Aplicación de muestreo ETP
└── resultados-relevamiento/        # Cobertura y respuestas del relevamiento
```

## Publicación

El proyecto es un sitio estático y no requiere compilación. Puede publicarse directamente mediante GitHub Pages desde la raíz de la rama configurada para despliegue.

Todas las rutas internas son relativas, por lo que las aplicaciones funcionan bajo el subdirectorio del repositorio.

## Dependencias y datos

- Leaflet, TopoJSON y SheetJS se cargan desde los CDN utilizados por cada aplicación.
- Consejos y Prácticas Profesionalizantes consultan sus fuentes de datos externas originales.
- Los archivos cartográficos y las bases locales de cada aplicación se mantienen dentro de su propio subdirectorio.

## Actualización local del relevamiento

El Excel fuente se conserva en `outputs/` y está excluido de Git. Para regenerar el derivado público sin modificar el libro:

```text
python scripts/procesar_relevamiento.py <excel_fuente> practicas-profesionalizantes/assets/escuelas.geojson resultados-relevamiento/assets/data/respuestas-publicas.json <informe_validacion> --internal-json resultados-relevamiento/assets/data/respuestas-internas.json --weighted-base <muestra_completa_con_respuestas.csv>
```

La base ponderada debe contener las 492 posiciones de la muestra, el estado de respuesta y `ponderador_num`. La aplicación publica la cobertura simple y ponderada por jurisdicción y permite alternar las distribuciones de ocho preguntas: 2.1.1, 2.2.3, 2.2.5, 3.3, 3.4, 4.2, 5.5 y 5.6. La versión publicada consume `respuestas-publicas.json`, que excluye CUE, nombres, matrícula, adjuntos y comentarios abiertos. Cuando se ejecuta en `localhost`, utiliza `respuestas-internas.json`, que agrega únicamente el nombre institucional para identificar los puntos. La base ponderada, el derivado interno y el informe de validación permanecen excluidos de Git.
