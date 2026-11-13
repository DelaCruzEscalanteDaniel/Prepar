# Prepar

Simulador educativo del **Presupuesto Participativo de la Ciudad de México**. Permite practicar todo el proceso: las ciudadanas y los ciudadanos proponen ideas y proyectos para su colonia, el gobierno de la alcaldía los dictamina, se vota de forma secreta y después se vigila la ejecución de las obras ganadoras.

> Simulador educativo sin validez oficial. No tiene relación con el IECM ni con las alcaldías.

Sitio publicado: https://prepar-u55c.onrender.com

## Equipo y ramas

| Rol | Integrante | Rama |
|---|---|---|
| Líder | Hernández Malagón Daniel | `lider` |
| Analista | Leonar Serrano Johan Joshua | `analista` |
| Diseñador | Serrano Jiménez Jostin Kiroshi | `disenador` |
| Programador | De la Cruz Escalante Daniel A. | `programador` |

Cada integrante trabaja en su rama y el líder integra los cambios en `main` mediante Pull Requests.

## Roles del sistema

- **Ciudadano:** foro vecinal de su alcaldía, registro de proyectos, votación secreta con comprobante, mapa de proyectos y foto denuncia de las obras.
- **Funcionario:** revisión de registros y del foro, dictaminación, sorteo de la boleta, casos especiales y seguimiento de obras.
- **Administrador:** control del ciclo y sus 8 fases, funcionarios y ciudadanos, estadísticas y bitácora.

## Tecnologías

- **Servidor:** Node.js 20 o superior con Express.
- **Base de datos:** MySQL 8 (tablas, vistas, disparadores y procedimientos almacenados en `bd/prepar_bd_mysql.sql`).
- **Front-end:** HTML, CSS y JavaScript sin frameworks; mapas con Leaflet y gráficas con Chart.js.
- **Datos abiertos:** alcaldías, colonias e indicadores del Portal de Datos Abiertos de la CDMX.
- **Correo:** API de Brevo.

## Estructura

```
bd/          script de la base de datos
server/      servidor: app.js, rutas de la API (routes/) y lógica (lib/)
public/      páginas, estilos, imágenes y JavaScript del navegador
scripts/     instalación de la base y datos de prueba
test/        pruebas automáticas (node --test)
```

## Ejecutar en una computadora

1. Instalar Node.js 20+ y MySQL 8+.
2. `npm install`
3. Copiar `.env.example` como `.env` y llenar los datos de MySQL.
4. `npm run bd:instalar` y después `npm run demo` (datos de prueba).
5. `npm start` y abrir http://localhost:3000

Pruebas: `npm test`

## Publicación

El sitio se publica en Render desde la rama `main`; la base de datos está en Aiven (MySQL 8). Las credenciales viven en las variables de entorno del servidor y nunca se suben al repositorio. Al arrancar, el sistema aplica solo las migraciones que le falten a la base.
