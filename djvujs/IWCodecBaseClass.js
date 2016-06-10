'use strict';

//блок - структурная единица исходного изображения
class Block {
    constructor() {
        this.buckets = [];
        for (var i = 0; i < 64; i++) {
            this.buckets.push(new Int16Array(16));
        }
        /*this.activeCoefFlags = new Uint8Array(1024);
        this.potentialCoefFlags = new Uint8Array(1024);
        this.activeBucketFlags = new Uint8Array(64);
        this.potentialBucketFlags = new Uint8Array(64);
        this.coefDecodingFlags = new Uint8Array(64);
        this.activeBandFlags = new Uint8Array(10);
        this.potentialBandFlags = new Uint8Array(10);*/
        
        // в этих массивах хранятся флаги
       /* this.coefFlags = new Uint8Array(1024);
        this.bucketFlags = new Uint8Array(64);
        this.bandFlags = new Uint8Array(10);*/
    }
    
    getCoef(n) {
        var b = n >> 4;
        var i = n % 16;
        return this.buckets[b][i];
    }
    
    setCoef(n, val) {
        var b = n >> 4;
        var i = n % 16;
        this.buckets[b][i] = val;
    }
}

//класс общих данных для кодирования и декодирования картинки
class IWCodecBaseClass {
    
    constructor() {
        this.steps = [0x004000, 
        0x008000, 0x008000, 0x010000, 
        0x010000, 0x010000, 0x020000, 
        0x020000, 0x020000, 0x040000, 
        0x040000, 0x040000, 0x080000, 
        0x040000, 0x040000, 0x080000];
        
        this.quant_lo = [0x004000, 0x008000, 0x008000, 0x010000, 
        0x010000, 0x010000, 0x010000, 0x010000, 
        0x010000, 0x010000, 0x010000, 0x010000, 
        0x020000, 0x020000, 0x020000, 0x020000];
        
        this.quant_hi = [0, 0x020000, 0x020000, 0x040000, 
        0x040000, 0x040000, 0x080000, 
        0x040000, 0x040000, 0x080000];
        
        this.bucketstate = new Uint8Array(16);
        this.coeffstate = new Array(16);
        for (var i = 0; i < 16; this.coeffstate[i++] = new Uint8Array(16)) {}
        this.bbstate = 0;
        
        this.decodeBucketCtx = new Uint8Array(1);
        this.decodeCoefCtx = new Uint8Array(80);
        this.activateCoefCtx = new Uint8Array(16);
        this.inreaseCoefCtx = new Uint8Array(1);
        this.curband = 0;
    }
    
    getBandBuckets(band) {
        let a = 0;
        let b = 0;
        switch (band) {
        case 0:
            break;
        case 1:
            a = 1;
            b = 1;
            break;
        case 2:
            a = 2;
            b = 2;
            break;
        case 3:
            a = 3;
            b = 3;
            break;
        case 4:
            a = 4;
            b = 7;
            break;
        case 5:
            a = 8;
            b = 11;
            break;
        case 6:
            a = 12;
            b = 15;
            break;
        case 7:
            a = 16;
            b = 31;
            break;
        case 8:
            a = 32;
            b = 47;
            break;
        case 9:
            a = 48;
            b = 63;
            break;
        default:
            throw new Error("Incorrect band index: " + band);
            break;
        }
        return {
            from: a,
            to: b
        };
    }
    
    //проверяем надо ли вообще что либо делать или просто уменьшить шаг
    is_null_slice() 
    {
        if (this.curband == 0) // для нулевой группы шаги разные, поэтому надо проверить все
        {
            var is_null = 1;
            for (var i = 0; i < 16; i++) 
            {
                var threshold = this.quant_lo[i];
                //чтобы не проверять потом этот коэффициент
                this.coeffstate[0][i] = this.ZERO;
                if (threshold > 0 && threshold < 0x8000) 
                {
                    this.coeffstate[0][i] = this.UNK;
                    is_null = 0;
                }
            }
            if(is_null) {
               // console.log('null slice curband = ', this.curband);
            }
            return is_null;
        } 
        else // иначе просто смотрим шаг группы
        {
            var threshold = this.quant_hi[this.curband];
            if(!(threshold > 0 && threshold < 0x8000)) {
                //console.log('null slice curband = ', this.curband);
            }
            return ( !(threshold > 0 && threshold < 0x8000)) ;
        }
    }
    
    
    //уменьшение шага после обработки одной порции данных
    // todo использовать curbit
    finish_code_slice() {
        this.quant_hi[this.curband] = this.quant_hi[this.curband] >> 1;
        if (this.curband === 0) {
            for (var i = 0; i <= 6; i++) {
                this.steps[i] = Math.floor(this.steps[i] / 2);
            }
            for (var i = 0; i < 16; i++)
                this.quant_lo[i] = this.quant_lo[i] >> 1;
        }
        else {
            this.steps[this.curband + 6] = Math.floor(this.steps[this.curband + 6] / 2);
        }
        
        this.curband++;
        if (this.curband === 10) {
            this.curband = 0;
        }
    }
    
    //возвращает шаг коэффициентов по их индексу от 0 до 1023
    getStep(i) {
        
        if (i === 0) {
            return this.quant_lo[0];

        } else if (i === 1) {
            return this.quant_lo[1];

        } else if (i === 2) {
            return this.quant_lo[2];

        } else if (i === 3) {
            return this.quant_lo[3];

        } else if (i >= 4 && i <= 7) {
            return this.quant_lo[4];

        } else if (i >= 8 && i <= 11) {
            return this.quant_lo[8];

        } else if (i >= 12 && i <= 15) {
            return this.quant_lo[12];

        } else if (i >= 16 && i <= 31) {
            return this.quant_hi[1];;
        } else if (i >= 32 && i <= 47) {
            return this.quant_hi[2];
        } else if (i >= 48 && i <= 63) {
           return this.quant_hi[3];
        } else if (i >= 64 && i <= 127) {
            return this.quant_hi[4];
        } else if (i >= 128 && i <= 191) {
           return this.quant_hi[5];
        } else if (i >= 192 && i <= 255) {
           return this.quant_hi[6];
        } else if (i >= 256 && i <= 511) {
            return this.quant_hi[7];
        } else if (i >= 512 && i <= 767) {
            return this.quant_hi[8];
        } else if (i >= 768 && i <= 1023) {
           return this.quant_hi[9];
        } 
        else {
            throw new Error("Too big coefficient index!");
        }
    }
}
// this coeff never hits this bit
IWCodecBaseClass.prototype.ZERO = 1;
// this coeff is already active активный
IWCodecBaseClass.prototype.ACTIVE = 2;
// this coeff is becoming active при закодировании используется, когда собираемся закодировать
IWCodecBaseClass.prototype.NEW = 4;
// потенциальный флаг
IWCodecBaseClass.prototype.UNK = 8;


IWCodecBaseClass.prototype.zigzagRow = Uint8Array.of(
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
0, 0, 16, 16, 0, 0, 16, 16, 8, 8, 24, 24, 8, 8, 24, 24, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
4, 4, 20, 20, 4, 4, 20, 20, 12, 12, 28, 28, 12, 12, 28, 28, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
2, 2, 18, 18, 2, 2, 18, 18, 10, 10, 26, 26, 10, 10, 26, 26, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
6, 6, 22, 22, 6, 6, 22, 22, 14, 14, 30, 30, 14, 14, 30, 30, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
1, 1, 17, 17, 1, 1, 17, 17, 9, 9, 25, 25, 9, 9, 25, 25, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
5, 5, 21, 21, 5, 5, 21, 21, 13, 13, 29, 29, 13, 13, 29, 29, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
3, 3, 19, 19, 3, 3, 19, 19, 11, 11, 27, 27, 11, 11, 27, 27, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31, 
7, 7, 23, 23, 7, 7, 23, 23, 15, 15, 31, 31, 15, 15, 31, 31);

IWCodecBaseClass.prototype.zigzagCol = Uint8Array.of(
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
0, 16, 0, 16, 8, 24, 8, 24, 0, 16, 0, 16, 8, 24, 8, 24, 
4, 20, 4, 20, 12, 28, 12, 28, 4, 20, 4, 20, 12, 28, 12, 28, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
2, 18, 2, 18, 10, 26, 10, 26, 2, 18, 2, 18, 10, 26, 10, 26, 
6, 22, 6, 22, 14, 30, 14, 30, 6, 22, 6, 22, 14, 30, 14, 30, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
1, 17, 1, 17, 9, 25, 9, 25, 1, 17, 1, 17, 9, 25, 9, 25, 
5, 21, 5, 21, 13, 29, 13, 29, 5, 21, 5, 21, 13, 29, 13, 29, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31, 
3, 19, 3, 19, 11, 27, 11, 27, 3, 19, 3, 19, 11, 27, 11, 27, 
7, 23, 7, 23, 15, 31, 15, 31, 7, 23, 7, 23, 15, 31, 15, 31);
