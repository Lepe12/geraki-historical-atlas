"""Synthetic only: checks independent hold-outs and source integrity."""
import json
import tempfile
import unittest
from pathlib import Path

from tools.historical_map_georeference import fit_candidate, export_candidate_raster, sha256_file


class HistoricalMapGeoreferencingTests(unittest.TestCase):
    def setUp(self):
        try:
            from PIL import Image
            from pyproj import Transformer
        except ImportError:
            self.skipTest("Pillow and pyproj required")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/"synthetic.png"
        Image.new("RGB",(300,220),"#eeeeee").save(self.path)
        inverse=Transformer.from_crs("EPSG:32635","EPSG:4326",always_xy=True)
        pixels=[(30,30),(260,35),(40,180),(260,180),(140,45),(130,160)]
        gcps=[]
        for i,(x,y) in enumerate(pixels):
            east=520000+90*x+2*y
            north=4200000+3*x-95*y
            lon,lat=inverse.transform(east,north)
            gcps.append({"id":f"gcp_{i+1:04d}","pixel_x":x,"pixel_y":y,
                "longitude":lon,"latitude":lat,
                "placename":f"SYNTHETIC point {i}","reference_url":"https://example.org/synthetic",
                "reviewer":"test-only","state":"GCP_PROPOSED_NOT_VERIFIED"})
        h=sha256_file(self.path)
        self.review={"schema":"nabou-manual-map-review-v1",
                     "image_sha256":h,"source":{"id":"test-synthetic","url":"https://example.org/test",
                     "image_sha256":h},
                     "historically_verified":0,"map_georeferenced":False,"gcps":gcps}
        self.controls=[g["id"] for g in gcps[:4]]
        self.checks=[g["id"] for g in gcps[4:]]

    def test_affine_uses_held_out_independent_gcps(self):
        result,aff=fit_candidate(self.review,self.path,control_ids=self.controls,check_ids=self.checks)
        self.assertLess(result["holdout_rmse_m"],.01)
        self.assertLess(result["control_rmse_m"],.01)
        self.assertEqual(result["holdout_gcp_ids"],self.checks)
        self.assertEqual(result["georeference_status"],"CANDIDATE_NOT_APPROVED")
        self.assertFalse(result["historically_verified"])
        self.assertEqual(result["source_id"],"test-synthetic")
        self.assertEqual(result["metric_crs"],"EPSG:32635")

    def test_refuse_tampered_original_image(self):
        self.review["image_sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"SOURCE_IMAGE_SHA256"):
            fit_candidate(self.review,self.path,control_ids=self.controls,check_ids=self.checks)

    def test_refuse_overlapping_or_unheld_gcps(self):
        with self.assertRaisesRegex(ValueError,"disjoint"):
            fit_candidate(self.review,self.path,control_ids=self.controls,
                          check_ids=[self.controls[0],self.checks[1]])
        with self.assertRaisesRegex(ValueError,"at least 4"):
            fit_candidate(self.review,self.path,control_ids=self.controls[:3],check_ids=self.checks)

    def test_refuse_invalid_gcp_provenance(self):
        self.review["gcps"][0]["reference_url"]="http://untrusted.example.org"
        with self.assertRaisesRegex(ValueError,"HTTPS citation"):
            fit_candidate(self.review,self.path,control_ids=self.controls,check_ids=self.checks)

    def test_refuse_degenerate_control_layout(self):
        for i,x in enumerate(self.review["gcps"][:4]):
            x["pixel_y"]=10*x["pixel_x"]+1 if i!=0 else 301
        with self.assertRaises(ValueError):
            fit_candidate(self.review,self.path,control_ids=self.controls,check_ids=self.checks)

    def test_export_only_requested_candidate_tiff(self):
        try:
            import rasterio
        except ImportError:
            self.skipTest("rasterio required")
        result,aff=fit_candidate(self.review,self.path,control_ids=self.controls,check_ids=self.checks)
        dest=Path(self.tmp.name)/"candidate.tif"
        with self.assertRaisesRegex(ValueError,"THRESHOLD"):
            export_candidate_raster(self.path,dest,aff,{**result,"holdout_max_error_m":999},max_holdout_m=5)
        self.assertFalse(dest.exists())
        export_candidate_raster(self.path,dest,aff,result,max_holdout_m=5)
        with rasterio.open(dest) as ds:
            self.assertEqual(ds.crs.to_epsg(),32635)
            self.assertEqual(ds.tags()["NABOU_VERIFICATION"],"CANDIDATE_NOT_APPROVED")
            self.assertEqual(ds.tags()["NABOU_SOURCE_SHA256"],sha256_file(self.path))


if __name__ == "__main__":
    unittest.main()
