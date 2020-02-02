function filterToggle(toggleClass) {
    this.classList.toggle('active');

    var x = document.getElementsByClassName(toggleClass);

    for (var i = 0; i < x.length; i++) {
        x[i].classList.toggle('hidden');
    }
}


function filterImages(toggleClass) {
    var x = document.getElementsByClassName(toggleClass);

    for (var i = 0; i < x.length; i++) {
        x[i].classList.toggle('hidden');
    }
}

