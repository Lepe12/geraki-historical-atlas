"""All historical geography in this test is explicitly SYNTHETIC."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.historical_map_ocr import ocr_rows_to_map_geojson, read_geotiff_and_ocr
from tools.historical_map_intelligence import convert_labels

TSV = ("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
       "5\t1\t1\t1\t1\t1\t10\t20\t50\t15\t90\tMILO\n"
       "5\t1\t1\t1\t1\t2\t60\t20\t50\t15\t15\tUNREADABLE\n")

class HistoricalMapOcrTests(unittest.TestCase):
    def test_normalize_tesseract_confidence_and_pixel_footprints(self):
        def synthetic_pixel_transform(x,y):
            return 23 + x * .002, 37 - y * .002
        geojson, rejected=ocr_rows_to_map_geojson(
            TSV, pixel_to_world=synthetic_pixel_transform, min_confidence=.35)
        self.assertEqual(len(geojson["features"]), 1)
        self.assertGreaterEqual(rejected,1)
        first=geojson["features"][0]
        self.assertEqual(first["properties"]["score"], .9)
        self.assertEqual(first["properties"]["text"], "MILO")
        self.assertEqual(first["geometry"]["coordinates"][0][0], [23.02,36.96])
        output=convert_labels(geojson, source_id="synthetic:map",
            source_url="https://example.org/synthetic", rights="test fixture",
            map_title="SYNTHETIC TEST MAP", crs="EPSG:4326")
        self.assertEqual(output["features"][0]["properties"]["identity_status"],"CANDIDATE_UNREVIEWED")
        self.assertFalse(output["features"][0]["properties"]["historical_claim_verified"])

    def test_refuse_no_georeference(self):
        with self.assertRaisesRegex(ValueError,"Georeferencing"):
            ocr_rows_to_map_geojson(TSV, pixel_to_world=None)

    def test_invalid_tsv(self):
        with self.assertRaisesRegex(ValueError,"TSV"):
            ocr_rows_to_map_geojson("bad\tdata\n",pixel_to_world=lambda x,y:(x,y))

    def test_real_engine_geotiff_with_synthetic_image(self):
        try:
            import numpy as np
            import rasterio
            from rasterio.transform import from_origin
            from PIL import Image, ImageDraw, ImageFont
        except ImportError:
            self.skipTest("Optional local OCR runtime dependencies absent")
        if shutil.which("tesseract") is None:
            self.skipTest("Optional Tesseract binary absent")
        with tempfile.TemporaryDirectory() as directory:
            img=Image.new("L",(780,220),255)
            draw=ImageDraw.Draw(img)
            font_path="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
            font=ImageFont.truetype(font_path,88) if Path(font_path).is_file() else None
            draw.text((72,45),"MILO",font=font,fill=0)
            dest=Path(directory)/"synthetic_georeferenced_map.tif"
            with rasterio.open(dest,"w",driver="GTiff",width=img.width,height=img.height,
                    count=1,dtype="uint8",crs="EPSG:4326",
                    transform=from_origin(23.9,37.3,.0006,.0006)) as f:
                f.write(np.asarray(img),1)
            geo,meta=read_geotiff_and_ocr(dest,languages="eng",min_confidence=.15)
            self.assertEqual(meta["raster_crs"],"EPSG:4326")
            labels=[f["properties"]["text"].upper() for f in geo["features"]]
            self.assertTrue(any("MILO" in label for label in labels),labels)


if __name__=="__main__":
    unittest.main()
