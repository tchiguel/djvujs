import JB2Codec from './JB2Codec';
import { Baseline, Bitmap } from './JB2Structures';
import DjVu from '../DjVu';

export default class JB2Image extends JB2Codec {
    constructor(bs) {
        super(bs);
        this.dict = []; // dict of bitmaps
        this.initialDictLength = 0; // a number of bitmaps from a shared dict (if required)     
        this.blitList = []; // "blit" = "block transfer"
        this.init();
    }

    /**
     * Добавляет в список битмап и координаты левого нижнего угла в классической системе координат
     * @param {Bitmap} bitmap 
     * @param {Number} x 
     * @param {Number} y 
     */
    addBlit(bitmap, x, y) {
        this.blitList.push({ bitmap, x, y });
    }

    //раскодируем первую запись в потоке
    init() {
        var type = this.decodeNum(0, 11, this.recordTypeCtx);
        if (type == 9) {
            // длина словаря
            this.initialDictLength = this.decodeNum(0, 262142, this.inheritDictSizeCtx);
            //тип следующей записи (должен быть 0)
            type = this.decodeNum(0, 11, this.recordTypeCtx);
            //console.log("Zero", type);
        }

        this.width = this.decodeNum(0, 262142, this.imageSizeCtx) || 200;
        this.height = this.decodeNum(0, 262142, this.imageSizeCtx) || 200;
        // инициализация когда будет надо
        this.bitmap = false;
        //позиции первого и предыдущего символа на строке
        this.lastLeft = 0;
        this.lastBottom = this.height - 1;
        this.firstLeft = -1; // получено экспериментально, чтобы не вычитать 1 каждый раз из x как это делается в javadjvu
        this.firstBottom = this.height - 1;
        // флаг всегда должен быть = 0 
        var flag = this.zp.decode([0], 0);
        if (flag) {
            throw new Error("Bad flag!!!");
        }

        this.baseline = new Baseline();
    }

    toString() {
        var str = super.toString();
        str += "{width: " + this.width + ", height: " + this.height + '}\n';
        return str;
    }

    decode(djbz) {
        // если затребован словарь 
        if (this.initialDictLength) {
            //декодируем словарь (он может быть уже декодирован)
            djbz.decode();
            //копируем затребованное число символов
            this.dict = djbz.dict.slice(0, this.initialDictLength);
        }
        var type = this.decodeNum(0, 11, this.recordTypeCtx);
        var width, hoff, voff, flag;
        var height, index;
        var bm;
        // var count = 0; // degug code
        //var maxInterationNumber = 2000;
        while (type !== 11 /*&& count < maxInterationNumber*/) { // 11 means "End of data"
            //count++;
            // DjVu.IS_DEBUG && console.log('count', count);
            // DjVu.IS_DEBUG && console.log(type);
            switch (type) {

                case 1: // New symbol, add to image and library 
                    width = this.decodeNum(0, 262142, this.symbolWidthCtx);
                    height = this.decodeNum(0, 262142, this.symbolHeightCtx);
                    bm = this.decodeBitmap(width, height);
                    //this.drawBitmap(bm);
                    var coords = this.decodeSymbolCoords(bm.width, bm.height);
                    this.addBlit(bm, coords.x, coords.y);
                    //this.copyToBitmap(bm, coords.x, coords.y);
                    this.dict.push(bm.removeEmptyEdges());
                    //Globals.drawBitmapOnImageCanvas(bm, coords.x, coords.y, this);
                    break;

                case 2: // New symbol, add to library only
                    width = this.decodeNum(0, 262142, this.symbolWidthCtx);
                    height = this.decodeNum(0, 262142, this.symbolHeightCtx);
                    bm = this.decodeBitmap(width, height);
                    this.dict.push(bm.removeEmptyEdges());
                    break;

                case 3: // New symbol, add to image only 
                    width = this.decodeNum(0, 262142, this.symbolWidthCtx);
                    height = this.decodeNum(0, 262142, this.symbolHeightCtx);
                    bm = this.decodeBitmap(width, height);
                    //this.drawBitmap(bm);
                    var coords = this.decodeSymbolCoords(bm.width, bm.height);
                    this.addBlit(bm, coords.x, coords.y);
                    //this.copyToBitmap(bm, coords.x, coords.y);
                    break;

                case 4: // Matched symbol with refinement, add to image and library
                    index = this.decodeNum(0, this.dict.length - 1, this.symbolIndexCtx);
                    var widthdiff = this.decodeNum(-262143, 262142, this.symbolWidthDiffCtx);
                    var heightdiff = this.decodeNum(-262143, 262142, this.symbolHeightDiffCtx);
                    var mbm = this.dict[index];
                    var cbm = this.decodeBitmapRef(mbm.width + widthdiff, heightdiff + mbm.height, mbm);
                    var coords = this.decodeSymbolCoords(cbm.width, cbm.height);
                    this.addBlit(cbm, coords.x, coords.y);
                    //this.copyToBitmap(cbm, coords.x, coords.y);
                    this.dict.push(cbm.removeEmptyEdges());
                    break;

                case 5: // Matched symbol with refinement, add to library only
                    index = this.decodeNum(0, this.dict.length - 1, this.symbolIndexCtx);
                    widthdiff = this.decodeNum(-262143, 262142, this.symbolWidthDiffCtx);
                    heightdiff = this.decodeNum(-262143, 262142, this.symbolHeightDiffCtx);
                    var mbm = this.dict[index];
                    var cbm = this.decodeBitmapRef(mbm.width + widthdiff, heightdiff + mbm.height, mbm);
                    this.dict.push(cbm.removeEmptyEdges());
                    break;

                case 6: // Matched symbol with refinement, add to image only
                    index = this.decodeNum(0, this.dict.length - 1, this.symbolIndexCtx);
                    var widthdiff = this.decodeNum(-262143, 262142, this.symbolWidthDiffCtx);
                    var heightdiff = this.decodeNum(-262143, 262142, this.symbolHeightDiffCtx);
                    var mbm = this.dict[index];
                    var cbm = this.decodeBitmapRef(mbm.width + widthdiff, heightdiff + mbm.height, mbm);
                    var coords = this.decodeSymbolCoords(cbm.width, cbm.height);
                    this.addBlit(cbm, coords.x, coords.y);
                    //this.copyToBitmap(cbm, coords.x, coords.y);
                    break;

                case 7: // Matched symbol, copy to image without refinement
                    index = this.decodeNum(0, this.dict.length - 1, this.symbolIndexCtx);
                    bm = this.dict[index];
                    var coords = this.decodeSymbolCoords(bm.width, bm.height);
                    this.addBlit(bm, coords.x, coords.y);
                    //this.copyToBitmap(bm, coords.x, coords.y);
                    //this.drawBitmap(bm);
                    break;

                case 8: // Non-symbol data 
                    width = this.decodeNum(0, 262142, this.symbolWidthCtx);
                    height = this.decodeNum(0, 262142, this.symbolHeightCtx);
                    bm = this.decodeBitmap(width, height);
                    //this.drawBitmap(bm);
                    var coords = this.decodeAbsoluteLocationCoords(bm.width, bm.height);
                    this.addBlit(bm, coords.x, coords.y);
                    //this.copyToBitmap(bm, coords.x, coords.y);
                    break;

                case 9: // Numcoder reset
                    console.log("RESET NUM CONTEXTS"); // it hasn't been checked, may work incorrectly
                    this.resetNumContexts();
                    break;

                case 10:
                    this.decodeComment(); // TODO: test comments
                    break;

                default:
                    throw new Error("Unsupported type in JB2Image: " + type);
            }

            type = this.decodeNum(0, 11, this.recordTypeCtx);

            /*if (DjVu.IS_DEBUG && count > maxInterationNumber) {
                 console.error("Too many iterations!");
                 break;
             }*/
            if (type > 11) {
                console.error("TYPE ERROR " + type);
                break;
            }
        }
    }

    decodeAbsoluteLocationCoords(width, height) {
        var left = this.decodeNum(1, this.width, this.horizontalAbsLocationCtx);
        var top = this.decodeNum(1, this.height, this.verticalAbsLocationCtx);
        return {
            x: left,
            y: top - height
        }
    }

    decodeSymbolCoords(width, height) {
        var flag = this.zp.decode(this.offsetTypeCtx, 0); // флаг новой строки
        var horizontalOffsetCtx = flag ? this.hoffCtx : this.shoffCtx;
        var verticalOffsetCtx = flag ? this.voffCtx : this.svoffCtx;
        var horizontalOffset = this.decodeNum(-262143, 262142, horizontalOffsetCtx);
        var verticalOffset = this.decodeNum(-262143, 262142, verticalOffsetCtx);
        var x, y;
        if (flag) {
            x = this.firstLeft + horizontalOffset;
            y = this.firstBottom + verticalOffset - height + 1;
            this.firstLeft = x;
            this.firstBottom = y;
            this.baseline.fill(y);
        }
        else {
            x = this.lastRight + horizontalOffset;
            y = this.baseline.getVal() + verticalOffset;
        }
        this.baseline.add(y);
        this.lastRight = x + width - 1;
        return {
            'x': x,  // не вычитаем 1, так как firstLeft инициализирован -1, а Baseline и так выдает верный результат
            'y': y
        };

    }

    // принимает битмап и координаты левого нижнего угла в обычной системе координат
    copyToBitmap(bm, x, y) {
        if (!this.bitmap) {
            this.bitmap = new Bitmap(this.width, this.height);
        }

        for (var i = y, k = 0; k < bm.height; k++ , i++) {
            for (var j = x, t = 0; t < bm.width; t++ , j++) {
                if (bm.get(k, t)) {
                    this.bitmap.set(i, j);
                }
            }
        }
    }

    getBitmap() {
        if (!this.bitmap) {
            this.blitList.forEach(blit => this.copyToBitmap(blit.bitmap, blit.x, blit.y));
        }
        return this.bitmap;
    }

    getMaskImage() {
        var imageData = new ImageData(this.width, this.height);
        var pixelArray = imageData.data;
        var time = performance.now();
        pixelArray.fill(255); // все белым непрозрачным

        for (var blitIndex = 0; blitIndex < this.blitList.length; blitIndex++) {
            var blit = this.blitList[blitIndex];
            var bm = blit.bitmap;
            for (var i = blit.y, k = 0; k < bm.height; k++ , i++) {
                for (var j = blit.x, t = 0; t < bm.width; t++ , j++) {
                    if (bm.get(k, t)) {
                        var pixelIndex = ((this.height - i - 1) * this.width + j) * 4;
                        pixelArray[pixelIndex] = 0;
                    }
                }
            }
        }

        DjVu.IS_DEBUG && console.log("JB2Image mask image creating time = ", performance.now() - time);
        return imageData;
    }

    /**
     * Создаем изображение из маски и палитры, если таковая имеется
     * @param {DjVuPalette} palette 
     * @param {boolean} isMarkMaskPixels - чтобы понять какой пиксель брать из фона, а какой не трогать. 
     * Нужно только при составлении изображения из двух слоев
     */
    getImage(palette = null, isMarkMaskPixels = false) {

        if (palette && palette.getDataSize() !== this.blitList.length) {
            palette = null; // отбрасываем цвета если что-то не так.
        }

        var pixelArray = new Uint8ClampedArray(this.width * this.height * 4);
        var time = performance.now();
        pixelArray.fill(255); // все белым непрозрачным

        var blackPixel = { r: 0, g: 0, b: 0 };
        var alpha = isMarkMaskPixels ? 0 : 255;

        for (var blitIndex = 0; blitIndex < this.blitList.length; blitIndex++) {
            var blit = this.blitList[blitIndex];
            var pixel = palette ? palette.getPixelByBlitIndex(blitIndex) : blackPixel;
            var bm = blit.bitmap;
            for (var i = blit.y, k = 0; k < bm.height; k++ , i++) {
                for (var j = blit.x, t = 0; t < bm.width; t++ , j++) {
                    if (bm.get(k, t)) {
                        var pixelIndex = ((this.height - i - 1) * this.width + j) << 2;
                        pixelArray[pixelIndex] = pixel.r;
                        pixelArray[pixelIndex | 1] = pixel.g;
                        pixelArray[pixelIndex | 2] = pixel.b;
                        pixelArray[pixelIndex | 3] = alpha;
                    }
                }
            }
        }

        DjVu.IS_DEBUG && console.log("JB2Image creating time = ", performance.now() - time);
        return new ImageData(pixelArray, this.width, this.height);
    }

    getImageFromBitmap() { // debug function mostly
        this.getBitmap();
        var time = performance.now();
        var image = new ImageData(this.width, this.height);
        for (var i = 0; i < this.height; i++) {
            for (var j = 0; j < this.width; j++) {
                var v = this.bitmap.get(i, j) ? 0 : 255;
                var index = ((this.height - i - 1) * this.width + j) * 4;
                image.data[index] = v;
                image.data[index + 1] = v;
                image.data[index + 2] = v;
                image.data[index + 3] = 255;
            }
        }
        DjVu.IS_DEBUG && console.log("JB2Image creating time = ", performance.now() - time);
        return image;
    }
}
