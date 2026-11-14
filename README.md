# Prepar · Simulador del Presupuesto Participativo de la CDMX

Proyecto escolar del **Equipo 04**. Simula las 8 fases del Presupuesto Participativo de la Ciudad de México:
los vecinos proponen proyectos para su colonia, la alcaldía los revisa, los vecinos votan y después siguen cómo avanzan las obras.

| Integrante | Rol |
|---|---|
| Hernández Malagón Daniel | Líder |
| Leonar Serrano Johan Joshua | Analista |
| Serrano Jiménez Jostin Kiroshi | Diseñador |
| De la Cruz Escalante Daniel A. | Programador |

En línea: https://prepar-u55c.onrender.com

## Tecnologías

- **Base de datos:** MySQL 8 (21 tablas, 3 vistas, 6 triggers y 5 procedimientos almacenados).
- **Servidor:** Node.js con Express. Contraseñas con bcrypt y sesiones con cookie.
- **Páginas:** HTML, CSS y JavaScript, sin frameworks. Mapa con Leaflet y OpenStreetMap.
- **Correo:** API de Brevo, para recuperar la contraseña.

## ¿Qué puede hacer cada usuario?

| Ciudadano | Funcionario | Administrador |
|---|---|---|
| Publicar ideas, apoyarlas y comentarlas | Dictaminar proyectos (viable o no viable) | Crear ciclos y repartir el presupuesto |
| Registrar proyectos para su colonia | Hacer el sorteo de la boleta | Activar un ciclo y pasar de fase |
| Votar una vez (voto secreto) | Registrar pasos y gastos de las obras | Ver la gráfica de votos por colonia |
| Ver el mapa de proyectos | Borrar ideas, comentarios y fotos | Registrar funcionarios |
| Subir fotos de las obras (foto denuncia) | | Activar o desactivar cuentas |

## Las 8 fases

1. Convocatoria · 2. Diagnóstico y registro · 3. Dictaminación · 4. Sorteo y difusión · 5. Consulta · 6. Resultados · 7. Ejecución y seguimiento · 8. Evaluación

Al pasar a **Resultados** se calcula el ganador de cada colonia: gana el proyecto con más votos.
Si hay empate gana el que se registró primero; si solo hay un proyecto viable, gana ese; si nadie votó, la colonia se queda sin ganador.

## Cómo correrlo en tu computadora

1. Instala Node.js 20 o más nuevo y MySQL 8.
2. Copia `.env.example` como `.env` y escribe tus datos de MySQL.
3. Instala y prepara todo:
   ```
   npm install
   npm run bd:instalar
   npm run crear-admin
   npm start
   ```
4. Abre http://localhost:3000

Al arrancar, el servidor crea el **Ciclo de práctica** (activo, fase 2), el **Ciclo de demostración** (fase 7, con datos de ejemplo) y estas cuentas de prueba:

| Cuenta | Contraseña |
|---|---|
| maria.lopez@correo.mx (y otros 11 ciudadanos @correo.mx) | Ciudadano2026 |
| funcionario.demo.azc@prepar.mx · funcionario.demo.coy@prepar.mx | Funcionario2026 |

## Pruebas automáticas

```
npm test
```
Crean una base aparte (`prepar_prueba`) y recorren un ciclo completo: registro, foro, proyectos, dictamen, sorteo, votación, ganadores, obras y foto denuncia.

## Carpetas

```
bd/          script de la base de datos (tablas, vistas, triggers, procedimientos y catálogos)
scripts/     instalar la base y crear el administrador
server/      servidor Express: rutas de la API y funciones de apoyo
public/      páginas HTML, estilos y JavaScript del navegador
test/        pruebas automáticas
```
