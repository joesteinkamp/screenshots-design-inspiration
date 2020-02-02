function toggleClass(className) {
    var x = document.getElementsByClassName(className);

    for (var i = 0; i < x.length; i ++) {
        x[i].classList.toggle = 'hidden';
    }
}