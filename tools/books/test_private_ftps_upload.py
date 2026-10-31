import hashlib, json, tempfile, unittest, zipfile
from pathlib import Path
from private_ftps_upload import inspect_archive, upload

class UploadSafetyTests(unittest.TestCase):
    def archive(self, directory, broken=False):
        p=Path(directory)/"pages.zip"
        data=b"fake-image-fixture"
        item={"name":"page.jpg","bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
        if broken:item["sha256"]="0"*64
        with zipfile.ZipFile(p,"w") as z:
            z.writestr("page.jpg",data)
            z.writestr("manifest.json",json.dumps({"images":[item]}))
        return p
    def test_validate_without_network_or_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=upload(self.archive(tmp),None,True)
            self.assertEqual(result["image_count"],1)
            self.assertEqual(result["status"],"ARCHIVE_VALIDATED_NO_UPLOAD")
    def test_reject_corrupted_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                inspect_archive(self.archive(tmp,True))
if __name__=="__main__":unittest.main()
