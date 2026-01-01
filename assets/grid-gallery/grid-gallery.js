const root = document.querySelector("body, html");
const container = document.querySelector('.gg-container');
const images = document.querySelectorAll(".gg-box > .media");
const l = images.length;

for(var i = 0; i < l; i++) {
  images[i].addEventListener("click", function(e) {
    if (e.target.tagName === 'A' || e.target.closest('a')) return;

    var currentImg = this;
    const parentItem = currentImg.parentElement, screenItem = document.createElement('div');
    screenItem.id = "gg-screen";
    container.prepend(screenItem);
    if (parentItem.hasAttribute('data-theme')) screenItem.setAttribute("data-theme", "dark");
    
    function getRoute(el) {
        if (el.tagName === 'IMG' || el.tagName === 'VIDEO') return el.src;
        const child = el.querySelector('img, video');
        return child ? child.src : '';
    }

    var route = getRoute(currentImg);
    root.style.overflow = 'hidden';
    screenItem.innerHTML = '<div class="gg-image"></div><div class="gg-close gg-btn">&times</div><div class="gg-next gg-btn">&rarr;</div><div class="gg-prev gg-btn">&larr;</div>';
    
    const first = getRoute(images[0]), last = getRoute(images[l-1]);
    const imgItem = document.querySelector(".gg-image"), prevBtn = document.querySelector(".gg-prev"), nextBtn = document.querySelector(".gg-next"), close = document.querySelector(".gg-close");
    
    var fileExt = route.split('.').pop();

    if (fileExt === "mp4") {
      imgItem.innerHTML = '<video class="media web" autoplay="autoplay" muted="muted" loop="loop" playsinline="" src="' + route + '"></video>';
    }
    else {
      imgItem.innerHTML = '<img src="' + route + '">';
    }

    if (l > 1) {
      if (route == first) {
        prevBtn.hidden = true;
        var prevImg = false;
        var nextImg = currentImg.nextElementSibling;
      }
      else if (route == last) {
        nextBtn.hidden = true;
        var nextImg = false;
        var prevImg = currentImg.previousElementSibling;
      }
      else {
        var prevImg = currentImg.previousElementSibling;
        var nextImg = currentImg.nextElementSibling;
      }
    }
    else {
      prevBtn.hidden = true;
      nextBtn.hidden = true;
    }

    screenItem.addEventListener("click", function(e) {
      if (e.target == this || e.target == close) hide();
    });

    root.addEventListener("keydown", function(e) {
      if (e.keyCode == 37 || e.keyCode == 38) prev();
      if (e.keyCode == 39 || e.keyCode == 40) next();
      if (e.keyCode == 27 ) hide();
    });

    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);

    function prev() {
      prevImg = currentImg.previousElementSibling;
      var route = getRoute(prevImg);
      var fileExt = route.split('.').pop();

      if (fileExt === "mp4") {
        imgItem.innerHTML = '<video class="media web" autoplay="autoplay" muted="muted" loop="loop" playsinline="" src="' + route + '"></video>';
      }
      else {
        imgItem.innerHTML = '<img src="' + route + '">';
      }

      currentImg = currentImg.previousElementSibling;
      var mainImg = document.querySelector(".gg-image > .media") || document.querySelector(".gg-image > img");
      var mainSrc = mainImg.src;
      nextBtn.hidden = false;
      prevBtn.hidden = mainSrc === first;
    };

    function next() {
      nextImg = currentImg.nextElementSibling;
      var route = getRoute(nextImg);
      var fileExt = route.split('.').pop();

      if (fileExt === "mp4") {
        imgItem.innerHTML = '<video class="media web" autoplay="autoplay" muted="muted" loop="loop" playsinline="" src="' + route + '"></video>';
      }
      else {
        imgItem.innerHTML = '<img src="' + route + '">';
      }
      currentImg = currentImg.nextElementSibling;
      var mainImg = document.querySelector(".gg-image > .media") || document.querySelector(".gg-image > img");
      var mainSrc = mainImg.src;
      prevBtn.hidden = false;
      nextBtn.hidden = mainSrc === last;
    };

    function hide() {
      root.style.overflow = 'auto';
      screenItem.remove();
    };
  });
}

function gridGallery (options) {
  if (options.selector) selector = document.querySelector(options.selector);
  if (options.darkMode) selector.setAttribute("data-theme", "dark");
  if (options.layout == "horizontal" || options.layout == "square") selector.setAttribute("data-layout", options.layout);
  if (options.gaplength) selector.style.setProperty('--gap-length', options.gaplength + 'px');
  if (options.rowHeight) selector.style.setProperty('--row-height', options.rowHeight + 'px');
  if (options.columnWidth) selector.style.setProperty('--column-width', options.columnWidth + 'px');
}