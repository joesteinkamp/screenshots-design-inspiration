function filterImages(toggleClass) {
    var x = document.getElementsByClassName(toggleClass);

    for (var i = 0; i < x.length; i++) {
        x[i].classList.toggle('hidden');
    }
}

function showElement(id) {
    var x = document.getElementById(id);
    x.classList.remove('hidden');
}

// Exclusive "Only Show <form factor>" filter. Toggling it on marks the grid so
// CSS hides every image that isn't of that form factor; toggling it off
// restores them. See `.grid.only-*` in style.scss.
function toggleOnlyFormFactor(factor) {
    var grid = document.querySelector('.grid');
    if (grid) grid.classList.toggle('only-' + factor);
}