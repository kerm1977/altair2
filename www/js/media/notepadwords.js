// ============================================================================
// ARCHIVO: media/notepadwords.js (<= 200 líneas)
// RESPONSABILIDAD: Autocorrector ortográfico en vivo y motor de Sinónimos
//   (tesauro offline bidireccional en español + enriquecimiento online)
//   para el Bloc de Notas WYSIWYG.
// ============================================================================
window.TribalNotepadWords = (function () {
    'use strict';

    var CORRECTIONS = {
        tambien: 'también', cancion: 'canción', musica: 'música', facil: 'fácil',
        dificil: 'difícil', arbol: 'árbol', corazon: 'corazón', accion: 'acción',
        informacion: 'información', comunicacion: 'comunicación', edicion: 'edición',
        aplicacion: 'aplicación', telefono: 'teléfono', pagina: 'página',
        numero: 'número', ultimo: 'último', proximo: 'próximo', rapido: 'rápido',
        unico: 'único', publico: 'público', estabamos: 'estábamos', habia: 'había',
        tenia: 'tenía', podia: 'podía', queria: 'quería', sabia: 'sabía',
        ahi: 'ahí', aqui: 'aquí', asi: 'así', despues: 'después', ademas: 'además',
        atras: 'atrás', jamas: 'jamás', quizas: 'quizás', algun: 'algún',
        ningun: 'ningún', segun: 'según', comun: 'común', util: 'útil',
        inutil: 'inútil', debil: 'débil', fragil: 'frágil', exito: 'éxito',
        epoca: 'época', logica: 'lógica', fisica: 'física', quimica: 'química',
        imagenes: 'imágenes', jovenes: 'jóvenes', examenes: 'exámenes',
        arboles: 'árboles', pajaros: 'pájaros', sabado: 'sábado', miercoles: 'miércoles',
        dias: 'días', rio: 'río', frio: 'frío', mio: 'mío', tio: 'tío',
        pais: 'país', raiz: 'raíz', baul: 'baúl', oido: 'oído', caida: 'caída',
        cafe: 'café', sofa: 'sofá', mama: 'mamá', papa: 'papá', ojala: 'ojalá',
        perdon: 'perdón', razon: 'razón', pasion: 'pasión', mision: 'misión',
        vision: 'visión', union: 'unión', opcion: 'opción', funcion: 'función',
        solucion: 'solución', creacion: 'creación', oracion: 'oración',
        atencion: 'atención', direccion: 'dirección', coleccion: 'colección',
        conexion: 'conexión', expresion: 'expresión', emocion: 'emoción',
        sensacion: 'sensación', situacion: 'situación', relacion: 'relación',
        condicion: 'condición', posicion: 'posición', decision: 'decisión',
        television: 'televisión', avion: 'avión', camion: 'camión', rincon: 'rincón',
        salon: 'salón', balcon: 'balcón', jardin: 'jardín', almacen: 'almacén',
        interes: 'interés', estres: 'estrés', aereo: 'aéreo', linea: 'línea',
        heroe: 'héroe', oceano: 'océano', lagrima: 'lágrima', brujula: 'brújula',
        pelicula: 'película', capitulo: 'capítulo', titulo: 'título',
        articulo: 'artículo', vehiculo: 'vehículo', obstaculo: 'obstáculo',
        espectaculo: 'espectáculo', milagroso: 'milagroso', increible: 'increíble',
        egoista: 'egoísta', paraiso: 'paraíso', sonreir: 'sonreír', reir: 'reír',
        freir: 'freír', oir: 'oír', actuo: 'actúo', continuo: 'continúo',
        evaluo: 'evalúo', habito: 'hábito', credito: 'crédito', proposito: 'propósito',
        deposito: 'depósito', transito: 'tránsito', ejercito: 'ejército',
        medico: 'médico', tecnico: 'técnico', practico: 'práctico', clasico: 'clásico',
        magico: 'mágico', tragico: 'trágico', basico: 'básico', plastico: 'plástico',
        elastico: 'elástico', fantastico: 'fantástico', romantico: 'romántico',
        historico: 'histórico', economico: 'económico', politico: 'político',
        artistico: 'artístico', cientifico: 'científico', matematico: 'matemático',
        automatico: 'automático', simpatico: 'simpático', antipatico: 'antipático',
        problematico: 'problemático', democratico: 'democrático',
        haver: 'haber', haiga: 'haya', hiba: 'iba', llendo: 'yendo',
        valla: 'vaya', echo: 'hecho', hacerce: 'hacerse', dijistes: 'dijiste',
        hicistes: 'hiciste', fuistes: 'fuiste', vinistes: 'viniste',istes: 'iste'
    };

    var SYN_GROUPS = [
        ['bueno', 'excelente', 'óptimo', 'favorable', 'positivo', 'bondadoso', 'noble'],
        ['malo', 'pésimo', 'negativo', 'dañino', 'nocivo', 'adverso', 'deficiente'],
        ['grande', 'enorme', 'inmenso', 'vasto', 'amplio', 'gigante', 'colosal'],
        ['pequeño', 'diminuto', 'chico', 'reducido', 'mínimo', 'breve', 'escaso'],
        ['rápido', 'veloz', 'ágil', 'ligero', 'pronto', 'acelerado', 'raudo'],
        ['lento', 'pausado', 'calmado', 'tardo', 'sosegado', 'tranquilo'],
        ['bonito', 'hermoso', 'bello', 'lindo', 'precioso', 'atractivo', 'espléndido'],
        ['feo', 'desagradable', 'horrible', 'tosco', 'antiestético'],
        ['feliz', 'alegre', 'contento', 'dichoso', 'radiante', 'gozoso', 'entusiasmado'],
        ['triste', 'melancólico', 'apenado', 'afligido', 'abatido', 'nostálgico'],
        ['fuerte', 'robusto', 'vigoroso', 'firme', 'resistente', 'poderoso', 'sólido'],
        ['débil', 'frágil', 'endeble', 'vulnerable', 'delicado', 'flaco'],
        ['hablar', 'conversar', 'dialogar', 'platicar', 'charlar', 'expresar', 'comunicar'],
        ['decir', 'expresar', 'manifestar', 'declarar', 'afirmar', 'pronunciar', 'mencionar'],
        ['hacer', 'realizar', 'ejecutar', 'elaborar', 'efectuar', 'construir', 'producir'],
        ['crear', 'inventar', 'generar', 'fundar', 'concebir', 'forjar', 'diseñar'],
        ['pensar', 'reflexionar', 'meditar', 'razonar', 'considerar', 'idear', 'imaginar'],
        ['mirar', 'observar', 'contemplar', 'ver', 'divisar', 'examinar', 'avistar'],
        ['caminar', 'andar', 'marchar', 'recorrer', 'transitar', 'pasear', 'avanzar'],
        ['ir', 'acudir', 'dirigirse', 'marchar', 'partir', 'viajar', 'trasladarse'],
        ['amar', 'querer', 'adorar', 'estimar', 'apreciar', 'venerar'],
        ['casa', 'hogar', 'vivienda', 'morada', 'residencia', 'domicilio', 'refugio'],
        ['trabajo', 'labor', 'empleo', 'ocupación', 'tarea', 'oficio', 'faena'],
        ['amigo', 'compañero', 'camarada', 'aliado', 'colega', 'hermano', 'confidente'],
        ['camino', 'sendero', 'ruta', 'vía', 'trayecto', 'vereda', 'rumbo'],
        ['luz', 'claridad', 'resplandor', 'brillo', 'fulgor', 'luminosidad', 'destello'],
        ['fuego', 'llama', 'hoguera', 'lumbre', 'incendio', 'brasa', 'ardor'],
        ['tribu', 'comunidad', 'clan', 'pueblo', 'familia', 'hermandad', 'linaje'],
        ['música', 'melodía', 'armonía', 'canción', 'ritmo', 'sonido', 'canto'],
        ['historia', 'relato', 'crónica', 'narración', 'leyenda', 'cuento', 'memoria'],
        ['libro', 'obra', 'volumen', 'texto', 'ejemplar', 'tomo', 'escrito'],
        ['nota', 'apunte', 'anotación', 'escrito', 'mensaje', 'registro', 'recordatorio'],
        ['idea', 'concepto', 'pensamiento', 'noción', 'ocurrencia', 'propuesta', 'plan'],
        ['tiempo', 'época', 'periodo', 'etapa', 'momento', 'instante', 'era'],
        ['agua', 'líquido', 'manantial', 'caudal', 'corriente', 'lluvia', 'rocío'],
        ['tierra', 'suelo', 'terreno', 'mundo', 'planeta', 'territorio', 'patria'],
        ['fuerza', 'energía', 'potencia', 'vigor', 'ímpetu', 'poder', 'fortaleza'],
        ['paz', 'calma', 'serenidad', 'armonía', 'tranquilidad', 'sosiego', 'quietud'],
        ['miedo', 'temor', 'pavor', 'espanto', 'angustia', 'recelo', 'inquietud'],
        ['valor', 'coraje', 'valentía', 'audacia', 'bravura', 'intrepidez', 'temple'],
        ['ayuda', 'apoyo', 'auxilio', 'socorro', 'asistencia', 'colaboración', 'respaldo'],
        ['buscar', 'indagar', 'explorar', 'investigar', 'rastrear', 'procurar'],
        ['encontrar', 'hallar', 'descubrir', 'localizar', 'ubicar', 'topar'],
        ['cambiar', 'modificar', 'transformar', 'alterar', 'variar', 'renovar'],
        ['mejorar', 'perfeccionar', 'optimizar', 'progresar', 'superar', 'pulir'],
        ['empezar', 'comenzar', 'iniciar', 'emprender', 'arrancar', 'inaugurar'],
        ['terminar', 'finalizar', 'concluir', 'acabar', 'completar', 'culminar'],
        ['importante', 'esencial', 'fundamental', 'relevante', 'clave', 'vital', 'crucial'],
        ['fácil', 'sencillo', 'simple', 'elemental', 'accesible', 'claro'],
        ['difícil', 'complejo', 'complicado', 'arduo', 'duro', 'laborioso'],
        ['nuevo', 'reciente', 'moderno', 'fresco', 'actual', 'novedoso', 'inédito'],
        ['viejo', 'antiguo', 'anciano', 'veterano', 'remoto', 'arcaico'],
        ['escribir', 'redactar', 'anotar', 'apuntar', 'componer', 'plasmar'],
        ['leer', 'repasar', 'interpretar', 'descifrar', 'estudiar', 'ojear']
    ];

    function matchCase(orig, replacement) {
        if (!orig) return replacement;
        if (orig === orig.toUpperCase() && orig.length > 1) return replacement.toUpperCase();
        var c0 = orig.charAt(0);
        if (c0 === c0.toUpperCase() && c0 !== c0.toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    }

    function autocorrectWord(word) {
        var clean = String(word || '').toLowerCase();
        var hit = CORRECTIONS[clean];
        return hit ? matchCase(word, hit) : word;
    }

    function autocorrectText(text) {
        return String(text || '').replace(/[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+/g, function (w) {
            return autocorrectWord(w);
        });
    }

    function norm(s) {
        return String(s || '').toLowerCase()
            .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
            .replace(/ó/g, 'o').replace(/ú/g, 'u').trim();
    }

    function synonymsFor(word) {
        var w = String(word || '').trim().toLowerCase();
        var wn = norm(w);
        var out = [], seen = {};
        seen[w] = 1;
        if (!w) return Promise.resolve([]);
        SYN_GROUPS.forEach(function (grp) {
            var match = grp.some(function (g) { return g === w || norm(g) === wn; });
            if (match) {
                grp.forEach(function (g) {
                    if (!seen[g]) { seen[g] = 1; out.push(matchCase(word, g)); }
                });
            }
        });
        if (!window.fetch) return Promise.resolve(out);
        return fetch('https://api.datamuse.com/words?ml=' + encodeURIComponent(w) + '&v=es&max=12')
            .then(function (r) { return r.json(); })
            .then(function (arr) {
                (arr || []).forEach(function (it) {
                    var sw = it && it.word;
                    if (sw && !seen[sw.toLowerCase()]) {
                        seen[sw.toLowerCase()] = 1;
                        out.push(matchCase(word, sw));
                    }
                });
                return out.slice(0, 18);
            }).catch(function () { return out; });
    }

    return {
        autocorrectWord: autocorrectWord,
        autocorrectText: autocorrectText,
        synonymsFor: synonymsFor
    };
})();
