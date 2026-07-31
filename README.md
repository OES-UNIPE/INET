# Aplicaciones ETP

Página de acceso unificada a tres aplicaciones web de información y análisis de la Educación Técnico Profesional.

## Aplicaciones

1. **Mapa de Institucionalización COPETyP** (`consejos/`)
2. **Mapa de Institucionalización de PP** (`practicas-profesionalizantes/`)
3. **Aplicación de muestreo ETP** (`muestreo/`)

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
└── muestreo/                       # Aplicación de muestreo ETP
```

## Publicación

El proyecto es un sitio estático y no requiere compilación. Puede publicarse directamente mediante GitHub Pages desde la raíz de la rama configurada para despliegue.

Todas las rutas internas son relativas, por lo que las aplicaciones funcionan bajo el subdirectorio del repositorio.

## Dependencias y datos

- Leaflet, TopoJSON y SheetJS se cargan desde los CDN utilizados por cada aplicación.
- Consejos y Prácticas Profesionalizantes consultan sus fuentes de datos externas originales.
- Los archivos cartográficos y las bases locales de cada aplicación se mantienen dentro de su propio subdirectorio.
