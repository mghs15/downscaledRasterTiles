const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const resize = async (buf) => {
  const res = new Uint8Array( 128 * 128 * 4 ).fill(0);
  
  if(buf){
    for( let i = 0; i < 256; i++ ){
      for( let j = 0; j < 256; i++ ){
        if( i % 2 < 1 && j % 2 < 1 ){
          const k = (i + j * 256) * 4;
          res[k] = buf[k];
          res[k+1] = buf[k+1];
          res[k+2] = buf[k+2];
          res[k+3] = buf[k+3];
        }
      }
    }
  }
  
  return res;
}

// 透明画像を生成する関数
const createTransparentImage = async () => {
  return await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).png().toBuffer();
};

// ディレクトリが存在しない場合に作成する関数
const ensureDirectoryExistence = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// 画像の縮小処理を行う関数
const downscaleTo256 = (data, width, height, channels) => {
  const newWidth = width / 2;
  const newHeight = height / 2;
  const newData = new Uint8Array(newWidth * newHeight * channels);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      for (let c = 0; c < channels; c++) {
        // 各4ピクセル（2x2 ブロック）の左上ピクセルを使用
        const srcIndex = ((y * 2) * width + (x * 2)) * channels + c;
        const dstIndex = (y * newWidth + x) * channels + c;
        newData[dstIndex] = data[srcIndex];
      }
    }
  }
  return newData;
};

// メイン関数
const createSmallerTile = async (dir, odir, z, x, y) => {
  const z0 = z+1;
  const x0 = x << 1;
  const y0 = y << 1;
  
  const outputPath = `${odir}/${z}/${x}/${y}.png`;
  ensureDirectoryExistence(outputPath);
  
  const images = [
    `${dir}/${z0}/${x0}/${y0}.png`,
    `${dir}/${z0}/${x0+1}/${y0}.png`,
    `${dir}/${z0}/${x0}/${y0+1}.png`,
    `${dir}/${z0}/${x0+1}/${y0+1}.png`,
  ];
  
  const buffers = [];

  for (const image of images) {
    // ファイルが存在するかを確認し、なければ透明画像を追加
    if (fs.existsSync(image)) {
      buffers.push(await sharp(image).resize(256, 256).toBuffer());
    } else {
      buffers.push(await createTransparentImage());
    }
  }
  

  // 4つの256x256画像を合成して512x512の画像を生成
  const compositeImage = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: buffers[0], left: 0, top: 0 },
      { input: buffers[1], left: 256, top: 0 },
      { input: buffers[2], left: 0, top: 256 },
      { input: buffers[3], left: 256, top: 256 }
    ])
    .raw() // 生のピクセルデータとして出力
    .toBuffer({ resolveWithObject: true });

  const { data, info } = compositeImage;
  
  // 512x512の画像データを256x256にダウンサンプリング
  const downscaledData = downscaleTo256(data, info.width, info.height, info.channels);

  if (fs.existsSync(outputPath)){
    console.log(`重複するためスキップします：${z}/${x}/${y}`);
    return;
  }
  
  // ダウンサンプリングされた画像を保存
  await sharp(downscaledData, {
    raw: {
      width: info.width / 2,
      height: info.height / 2,
      channels: info.channels
    }
  })
    .toFile(outputPath);

  console.log("画像が作成されました：" + `${z}/${x}/${y}`);
  
}


const main = z => {
  
  console.log(`ZL${z}の処理を開始`);
  
  const xList = fs.readdirSync(`${dir}/${z}`);
  const pms = [];

  xList.forEach( x => {
    
    const yList = fs.readdirSync(`${dir}/${z}/${x}`).map( file => {
      const y = file.split(".")[0];
      return y;
    });
    
    yList.forEach( y => {
      const z2 = +z - 1;
      const x2 = +x >> 1;
      const y2 = +y >> 1
      
      //console.log(dir, odir, z2, x2, y2);
      const pm = createSmallerTile(dir, odir, z2, x2, y2);
      pms.push(pm);
    });
    
  });
  
  Promise.all(pms)
    .then( v => {
      if(z > 3){
        main(z-1);
      }else{
        console.log("終了しました");
      }
    });

}

const dir = "./tiles";
const odir = "./tiles";

const z = 11;
main(z);
