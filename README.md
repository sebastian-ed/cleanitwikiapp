# Clean It Wiki

App web estática para GitHub Pages + Supabase, pensada para funcionar como una wiki corporativa interna.

## Qué resuelve

Centraliza conocimiento operativo y administrativo en una sola plataforma:

- manuales operativos por área
- RRHH, remuneraciones, recibos y preguntas frecuentes
- documentos adjuntos, imágenes, videos y links externos
- onboarding y capacitación interna
- gestión de usuarios y roles
- edición en vivo desde panel admin

No depende de build step ni framework pesado. Eso baja fricción operativa para publicar rápido en GitHub Pages.

## Stack

- frontend estático: HTML + CSS + JavaScript modular
- backend: Supabase
- auth: email + password
- permisos: RLS
- archivos: Supabase Storage con bucket privado y URLs firmadas
- contenido: Markdown renderizado en cliente

## Estructura

- `index.html`: shell principal
- `404.html`: fallback para GitHub Pages
- `css/styles.css`: interfaz responsive y mobile first
- `js/config.js`: credenciales públicas de Supabase
- `js/app.js`: lógica completa de auth, wiki, admin, recursos y branding
- `supabase/schema.sql`: tablas, triggers, RLS, funciones y bucket

## Implementado

### Acceso y seguridad

- login con email y contraseña
- registro de usuario
- recuperación de contraseña por email
- cambio de contraseña desde “Mi cuenta”
- perfiles con rol `user` o `admin`
- activación / desactivación de usuarios
- políticas RLS para contenido y archivos

### Wiki

- áreas principales
- categorías jerárquicas
- páginas en markdown
- navegación lateral por árbol
- buscador interno
- destacados en home
- biblioteca de recursos

### Admin

- alta / edición / baja de áreas
- alta / edición / baja de categorías
- alta / edición / baja de páginas
- alta / edición / baja de recursos
- subida de archivos al bucket privado
- mover archivos entre carpetas lógicas
- edición de branding básico
- gestión de usuarios

## Despliegue

### 1) Crear proyecto en Supabase

Creá un proyecto nuevo y copiá:

- Project URL
- anon/public key

### 2) Ejecutar el SQL

Abrí el SQL Editor de Supabase y pegá completo `supabase/schema.sql`.

Eso crea:

- tablas
- triggers
- funciones
- políticas RLS
- bucket `wiki-assets`
- datos iniciales mínimos

### 3) Configurar Auth

En Supabase Auth:

- habilitá Email/Password
- definí si querés confirmación obligatoria por email
- agregá la URL final de GitHub Pages en Redirect URLs
- agregá también la misma URL para recuperación de contraseña

Ejemplo:

- `https://TU-USUARIO.github.io/TU-REPO/`

### 4) Configurar `js/config.js`

Reemplazá:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_KEY',
  STORAGE_BUCKET: 'wiki-assets',
  APP_NAME: 'Clean It Wiki',
  APP_TAGLINE: 'Base viva de conocimiento interno',
  DEFAULT_PRIMARY_COLOR: '#1f6feb',
  RECOVERY_REDIRECT_URL: 'https://TU-USUARIO.github.io/TU-REPO/',
};
```

### 5) Subir a GitHub

Subí todo el contenido del proyecto a un repo y activá GitHub Pages sobre la rama principal.

## Primer administrador

El alta de usuarios la hace cada persona desde el formulario de registro.

Luego tenés dos caminos:

### Opción A: primer admin desde la app

Si todavía no existe ningún admin activo, el primer usuario autenticado puede tocar el botón:

- `Convertirme en primer admin`

### Opción B: promoción manual desde SQL

```sql
update public.profiles
set role = 'admin'
where email = 'tuemail@empresa.com';
```

## Limitaciones deliberadas

No expuse la service role key en el navegador. Eso sería una mala práctica de seguridad.

Por eso, esta versión:

- permite registro de usuarios desde la pantalla pública
- permite cambio de contraseña del propio usuario
- permite que admin cambie roles y active/desactive accesos
- **no** crea usuarios auth “por la fuerza” desde el navegador
- **no** resetea contraseñas de terceros desde el frontend

Si más adelante querés eso, la extensión correcta es:

- Supabase Edge Function protegida
- o gestión desde el panel de Supabase

## Recomendación de estructura de contenidos

No cargues la wiki como si fuera un disco C con ansiedad.

Modelo recomendado:

- **RRHH**
  - recibo de sueldo
  - vacaciones
  - licencias
  - ART
  - sanciones y procedimientos
- **Operaciones**
  - maestranza
  - tapizados
  - limpieza de vehículos
  - checklist por servicio
- **Seguridad y Calidad**
  - EPP
  - uso de productos
  - incidentes
  - protocolos
- **Administración**
  - compras
  - proveedores
  - facturación
  - documentación base

## Buenas prácticas

- una página por tema concreto
- títulos cortos y claros
- pasos secuenciales
- responsables definidos
- adjuntos al final
- preguntas frecuentes separadas
- evitar bloques eternos de texto

## Siguiente mejora lógica

Si querés llevar esto a nivel siguiente, el roadmap correcto sería:

1. versionado simple de páginas
2. aprobaciones editoriales
3. analytics de lectura
4. firma de lectura de procedimientos
5. Edge Functions para invitaciones admin y reset de contraseñas de terceros
6. comentarios internos o feedback por página

