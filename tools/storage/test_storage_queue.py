import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('queue_storage', pathlib.Path(__file__).with_name('queue_mariadb_storage.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StorageQueueTest(unittest.TestCase):
    def test_partial_data_stays_queued_and_records_missing_lanes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            lane = root / '123' / 'travellers'
            lane.mkdir(parents=True)
            (lane / 'index.json').write_text('{}')
            result = module.queue(root, '123')
            self.assertEqual(result['status'], 'QUEUED_HOST_LOCAL_IMPORT')
            self.assertEqual(result['durable_lane_indexes'], ['travellers'])
            self.assertEqual(len(result['missing_lane_indexes']), 9)
            self.assertTrue((root / '123' / 'MARIADB_STORAGE_INTENT.json').is_file())

    def test_missing_run_and_path_traversal_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            for run in ['123', '../123', '']:
                with self.assertRaises(ValueError):
                    module.queue(pathlib.Path(tmp), run)


if __name__ == '__main__':
    unittest.main()
