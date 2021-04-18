function filterImages(toggleClass) {
    var x = document.getElementsByClassName(toggleClass);

    for (var i = 0; i < x.length; i++) {
        x[i].classList.toggle('hidden');
    }
}

function showElement(id) {
    var x = document.getElementById(id);
    x.classList.toggle('hidden');
}