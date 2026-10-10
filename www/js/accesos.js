// ============================================================================
// ARCHIVO NUEVO: accesos.js
// RESPONSABILIDAD: Única y exclusivamente controlar los Accesos Directos.
// ============================================================================

window.inicializarAccesos = function() {
    const grid = document.getElementById('grid-accesos');
    if (!grid) return; // Si no estamos en la vista home, ignoramos el script

    // 1. Mostrar nombre del usuario si existe
    try {
        const user = JSON.parse(localStorage.getItem('usuarioActual'));
        if (user && user.nombre) {
            const greeting = document.getElementById('home-greeting');
            if (greeting) greeting.textContent = 'Hola, ' + user.nombre.split(' ')[0];
        }
    } catch(e) {}

    // 2. LA ÚNICA LISTA DE ACCESOS POR DEFECTO (Cero fantasmas)
    const accesosPorDefecto = [
        { nombre: 'Usuarios', ruta: 'usuarios', icono: 'bi-people-fill', color: '#6f42c1' },
        { nombre: 'TRIBALs', ruta: 'media', icono: 'bi-music-note-beamed', color: '#e2602e', enBarra: true }
    ];

    // 3. Cargar los que el usuario agregue manualmente con el botón +
    let accesosPersonalizados = [];
    try {
        const guardados = localStorage.getItem('accesosPersonalizados');
        if (guardados) {
            accesosPersonalizados = JSON.parse(guardados);
        }
    } catch(e) {}

    const todosLosAccesos = [...accesosPorDefecto, ...accesosPersonalizados];

    // 4. Dibujar los botones en pantalla
    function renderizarAccesos() {
        grid.innerHTML = '';
        todosLosAccesos.forEach((acc) => {
            const hashLimpio = acc.ruta.replace('.html', '');
            const bgColor = acc.color || '#0d6efd';

            const cardHtml = `
                <div class="col-6 col-md-4">
                    <a href="#${hashLimpio}" class="text-decoration-none">
                        <div class="card border-0 shadow-sm h-100 rounded-4 text-center p-3" style="transition: transform 0.2s;">
                            <div class="d-flex justify-content-center align-items-center mx-auto rounded-circle mb-2" 
                                 style="width: 60px; height: 60px; background-color: ${bgColor}20; color: ${bgColor};">
                                <i class="bi ${acc.icono}" style="font-size: 1.8rem;"></i>
                            </div>
                            <h6 class="text-dark fw-bold mb-0" style="font-size: 0.9rem;">${acc.nombre}</h6>
                        </div>
                    </a>
                </div>
            `;
            grid.innerHTML += cardHtml;
        });
    }

    renderizarAccesos();

    // 5. Lógica del botón + (Agregar nuevos)
    const formNuevo = document.getElementById('form-nuevo-acceso');
    if (formNuevo && !formNuevo.dataset.escuchadorActivo) {
        formNuevo.dataset.escuchadorActivo = "true"; // Evita que se dupliquen eventos
        
        formNuevo.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const nuevo = {
                nombre: document.getElementById('acc-nombre').value,
                ruta: document.getElementById('acc-ruta').value,
                icono: document.getElementById('acc-icono').value,
                color: '#0d6efd'
            };

            accesosPersonalizados.push(nuevo);
            localStorage.setItem('accesosPersonalizados', JSON.stringify(accesosPersonalizados));
            
            todosLosAccesos.push(nuevo);
            renderizarAccesos();

            const modalEl = document.getElementById('modalNuevoAcceso');
            const modalIns = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modalIns.hide();
            formNuevo.reset();
        });
    }
};

// ============================================================================
// VIGILANTE SPA: Cada vez que el usuario entre a "Home", cargamos los botones
// ============================================================================
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#home' || window.location.hash === '') {
        setTimeout(window.inicializarAccesos, 150);
    }
});

// Por si recarga la página directamente en Home
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash === '#home' || window.location.hash === '') {
        setTimeout(window.inicializarAccesos, 150);
    }
});