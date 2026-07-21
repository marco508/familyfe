/* Script partagé des pages d'aide.
   ─────────────────────────────────────────────────────────────────────
   1) ANNOTATIONS AUTO-ANCRÉES  ← le cœur du fichier
      Les flèches ne sont plus placées « à la main » en pourcentages :
      chaque flèche déclare la cible qu'elle désigne, et le navigateur
      calcule sa position réelle. Conséquence : elles restent justes à
      TOUS les points de rupture responsive, quelle que soit la police
      chargée, sur n'importe quel navigateur.

      Balisage attendu :
        <div class="phone">
          <div class="ph-in">
             <div class="ph-fab" data-cible="1">＋</div>
          </div>
          <span class="pt" data-pour="1" style="--a:192deg"><i data-n="1"></i></span>
        </div>

   2) Apparition au défilement + ombre de l'en-tête.
   Règle absolue : si quoi que ce soit échoue, le contenu reste lisible.
   ───────────────────────────────────────────────────────────────────── */
(function () {

  /* ── 1) Placement des flèches ───────────────────────────────────── */

  var ECART_POINTE = 6;   // souffle entre le bord de la cible et la pointe
  var ECART_NUMERO = 31;  // en deçà, deux numéros se chevauchent
  var RALLONGE = 17;      // de combien on écarte un numéro en conflit

  /* Distance du centre d'une boîte à son bord, dans la direction `rad`.
     C'est l'intersection rayon/rectangle : la pointe s'arrête pile au
     bord de la cible, qu'elle soit un petit rond ou une carte large. */
  function rayonBord(hw, hh, rad) {
    var c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    var rx = c < 1e-6 ? Infinity : hw / c;
    var ry = s < 1e-6 ? Infinity : hh / s;
    return Math.min(rx, ry);
  }

  /* Géométrie d'une flèche pour un angle donné : où s'arrête la pointe,
     quelle longueur de tige il faut pour que le numéro sorte du cadre,
     et combien de marge il reste avant de mordre sur la colonne. */
  function calculer(rad, c, x, largeur, libreG, libreD) {
    var cos = Math.cos(rad);
    var r = rayonBord(c.width / 2, c.height / 2, rad) + ECART_POINTE;
    var sortie = (cos > 0 ? largeur + 15 - x : -15 - x) / cos;
    var maxi = (cos > 0 ? largeur + libreD - 13 - x : -libreG + 13 - x) / cos;
    return {
      rad: rad, r: r,
      tige: Math.max(14, Math.min(sortie, maxi, 170) - r - 11),
      marge: Math.max(0, Math.min(maxi - sortie, 34))
    };
  }

  function placerAnnotations() {
    document.querySelectorAll('.phone').forEach(function (phone) {
      var cadre = phone.getBoundingClientRect();
      if (!cadre.width) return; // maquette pas encore mise en page

      var fleches = [];

      // Espace libre de part et d'autre de la maquette. Une flèche qui
      // désigne le bord d'une carte pleine largeur part de loin : sans
      // cette borne, son numéro déborderait sur l'étape voisine.
      var boite = (phone.closest('.etape') || phone.parentNode).getBoundingClientRect();
      var libreG = Math.max(0, cadre.left - boite.left - 4);
      var libreD = Math.max(0, boite.right - cadre.right - 4);

      phone.querySelectorAll('.pt[data-pour]').forEach(function (pt) {
        var cible = phone.querySelector('[data-cible="' + pt.dataset.pour + '"]');

        // Cible absente → on masque la flèche plutôt que de la laisser
        // pointer dans le vide (une flèche fausse est pire qu'aucune).
        if (!cible) { pt.classList.remove('place'); return; }

        var c = cible.getBoundingClientRect();
        var x = c.left + c.width / 2 - cadre.left;
        var y = c.top + c.height / 2 - cadre.top;

        // On efface la valeur posée au calcul précédent, sinon on relirait
        // notre propre tige raccourcie et elle rétrécirait à chaque
        // redimensionnement sans jamais revenir.
        pt.style.removeProperty('--l');
        var style = getComputedStyle(pt);
        var tige = parseFloat(style.getPropertyValue('--l')) || 42;

        // L'angle écrit dans le HTML est mémorisé au premier passage : on
        // s'autorise à le corriger ci-dessous, sans jamais perdre l'original.
        if (pt.dataset.a0 === undefined) {
          pt.dataset.a0 = String(parseFloat(style.getPropertyValue('--a')) || 0);
        }
        var rad0 = parseFloat(pt.dataset.a0) * Math.PI / 180;

        // Le numéro doit TOUJOURS ressortir sur le côté du cadre. Deux
        // conséquences : il ne recouvre jamais l'écran qu'il annote, et
        // tous les numéros d'une maquette s'alignent le long des bords,
        // ce qui se lit d'un coup d'œil.
        //   · le côté est dicté par la position de la cible, pas par
        //     l'angle écrit à la main — pointer le bouton « + » (à droite)
        //     depuis la gauche faisait traverser tout l'écran à la flèche ;
        //   · la composante horizontale est maintenue franche (≥ .88),
        //     sinon un angle rasant allonge démesurément la tige ;
        //   · l'inclinaison verticale d'origine est conservée, c'est elle
        //     qui empêche deux numéros voisins de se superposer.
        var g;

        // Cas particulier : un élément étroit tout en bas du cadre, c'est
        // un onglet de la barre de navigation. Le désigner par le côté est
        // ambigu — la pointe s'arrête à la frontière de l'onglet voisin et
        // semble le montrer lui. On pointe donc par en dessous, à la
        // verticale : impossible de se tromper d'onglet.
        if (y > cadre.height * 0.85 && c.width < cadre.width * 0.45) {
          var rv = c.height / 2 + ECART_POINTE;
          g = { rad: Math.PI / 2, r: rv,
                tige: Math.max(14, cadre.height + 15 - y - rv - 11), marge: 0 };
        } else {
          var cos = Math.max(0.88, Math.abs(Math.cos(rad0))) * (x < cadre.width / 2 ? -1 : 1);
          var sin = Math.sqrt(Math.max(0, 1 - cos * cos)) * (Math.sin(rad0) < 0 ? -1 : 1);
          g = calculer(Math.atan2(sin, cos), c, x, cadre.width, libreG, libreD);

        // Sur une cible large et basse (un bouton, une carte), une flèche
        // inclinée sort par le petit côté : la tige s'allonge alors
        // démesurément et barre la maquette en diagonale, au point qu'on
        // ne sait plus ce qu'elle désigne. À plat, elle sort par le côté
        // long — beaucoup plus court, et sans rien traverser.
          if (g.tige > 55) {
            var plat = calculer(cos > 0 ? 0 : Math.PI, c, x, cadre.width, libreG, libreD);
            if (plat.tige < g.tige) g = plat;
          }
        }

        var rad = g.rad, r = g.r;
        tige = g.tige;
        pt.style.setProperty('--a', (rad * 180 / Math.PI).toFixed(1) + 'deg');
        pt.style.setProperty('--l', tige.toFixed(1) + 'px');

        pt.style.left = (x / cadre.width * 100).toFixed(2) + '%';
        pt.style.top = (y / cadre.height * 100).toFixed(2) + '%';
        pt.style.setProperty('--r', r.toFixed(1) + 'px');
        pt.style.setProperty('--x', '0px');
        pt.classList.add('place');

        // `marge` : ce qu'il reste avant de mordre sur la colonne voisine,
        // donc tout ce dont on dispose pour écarter deux numéros superposés.
        fleches.push({ pt: pt, x: x, y: y, rad: rad, r: r, tige: tige, ext: 0, marge: g.marge });
      });

      // Deux numéros qui se superposent rendent la maquette illisible.
      // On repousse le second le long de sa propre tige : la direction
      // est conservée, donc la flèche continue de désigner la même chose.
      for (var passe = 0; passe < 6; passe++) {
        var conflit = false;
        for (var i = 0; i < fleches.length; i++) {
          for (var j = i + 1; j < fleches.length; j++) {
            var a = centreNumero(fleches[i]), b = centreNumero(fleches[j]);
            var dx = a.x - b.x, dy = a.y - b.y;
            // Rallonge plafonnée par la marge restante : mieux vaut deux
            // numéros un peu proches qu'un numéro sur la colonne voisine.
            if (Math.sqrt(dx * dx + dy * dy) < ECART_NUMERO &&
                fleches[j].ext + RALLONGE <= fleches[j].marge) {
              fleches[j].ext += RALLONGE;
              conflit = true;
            }
          }
        }
        if (!conflit) break;
      }
      fleches.forEach(function (f) {
        if (f.ext) f.pt.style.setProperty('--x', f.ext + 'px');
      });
    });
  }

  function centreNumero(f) {
    var d = f.r + f.tige + f.ext + 11; // 11 = demi-diamètre du numéro
    return { x: f.x + Math.cos(f.rad) * d, y: f.y + Math.sin(f.rad) * d };
  }

  // On replace après chaque événement susceptible de changer la mise en
  // page : chargement des images/polices, rotation, redimensionnement.
  var minuteur;
  function replacer() {
    clearTimeout(minuteur);
    minuteur = setTimeout(placerAnnotations, 60);
  }

  placerAnnotations();
  addEventListener('load', placerAnnotations);
  addEventListener('resize', replacer, { passive: true });
  addEventListener('orientationchange', replacer, { passive: true });
  // Les polices changent la hauteur des textes : on replace quand elles
  // sont prêtes (sinon les flèches visent l'ancienne mise en page).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(placerAnnotations).catch(function () {});
  }

  /* ── 2) Apparition au défilement ────────────────────────────────── */
  var cibles = document.querySelectorAll('.cat,.etape,.a-head,.a-intro,.note');
  var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduit || !('IntersectionObserver' in window)) {
    cibles.forEach(function (el) { el.classList.add('vu'); });
    placerAnnotations();
  } else {
    var io = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var rang = el.parentElement ? [].indexOf.call(el.parentElement.children, el) : 0;
        el.style.transitionDelay = Math.min(rang * 70, 210) + 'ms';
        el.classList.add('vu');
        io.unobserve(el);
        // L'élément passe de translateY(14px) à sa place définitive :
        // on recalcule les flèches une fois l'animation terminée.
        setTimeout(placerAnnotations, 560);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    cibles.forEach(function (el) { io.observe(el); });

    setTimeout(function () {
      cibles.forEach(function (el) { el.classList.add('vu'); });
      placerAnnotations();
    }, 3000);
  }

  /* ── 3) Ombre de l'en-tête au défilement ────────────────────────── */
  var h = document.querySelector('header'), tic = false;
  if (h) {
    addEventListener('scroll', function () {
      if (tic) return;
      tic = true;
      requestAnimationFrame(function () {
        h.classList.toggle('scrolled', scrollY > 8);
        tic = false;
      });
    }, { passive: true });
  }
})();
