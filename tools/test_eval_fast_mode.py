import io, json, os, sys, tempfile, unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval_fast_mode as efm

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/pct-parallel-multi-agent.yml'


class ProductionSelectionUnchanged(unittest.TestCase):
    def test_blank_selection_is_all_eleven_lanes(self):
        plan = efm.resolve_plan('', False)
        self.assertEqual(plan['matrix'], efm.ALLOWED_LANES)
        self.assertEqual(len(plan['matrix']), 11)
        self.assertTrue(plan['run_specialists'])
        self.assertFalse(plan['eval_fast_mode'])

    def test_subset_is_validated_deduplicated_and_ordered(self):
        self.assertEqual(efm.resolve_plan(' french, greek ,french', False)['matrix'], ['french', 'greek'])
        with self.assertRaises(SystemExit) as cm:
            efm.resolve_plan('french,klingon', False)
        self.assertEqual(str(cm.exception), 'UNKNOWN_RESEARCH_LANE:klingon')
        with self.assertRaises(SystemExit) as cm:
            efm.resolve_plan(' , ', False)
        self.assertEqual(str(cm.exception), 'EMPTY_RESEARCH_LANE_SELECTION')

    def test_production_subset_keeps_specialists(self):
        self.assertTrue(efm.resolve_plan('french,greek', False)['run_specialists'])


class FastModeSelection(unittest.TestCase):
    def test_fast_mode_requires_explicit_lanes(self):
        with self.assertRaises(SystemExit) as cm:
            efm.resolve_plan('', True)
        self.assertEqual(str(cm.exception), 'EVAL_FAST_MODE_REQUIRES_EXPLICIT_LANES')

    def test_fast_mode_caps_lane_count(self):
        with self.assertRaises(SystemExit):
            efm.resolve_plan('greek,french,venetian,travellers', True)
        self.assertEqual(efm.resolve_plan('greek,french,venetian', True)['matrix'], ['greek', 'french', 'venetian'])

    def test_specialists_only_when_travellers_selected(self):
        self.assertTrue(efm.resolve_plan('travellers,french', True)['run_specialists'])
        self.assertFalse(efm.resolve_plan('greek,spanish_simancas', True)['run_specialists'])

    def test_matrix_cli_outputs(self):
        env = {'PCT_SELECTED_AGENTS': 'travellers,french', 'PCT_EVAL_FAST_MODE': 'true'}
        old = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                efm.main(['matrix'])
        finally:
            for k, v in old.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        self.assertEqual(buf.getvalue().splitlines(),
                         ['matrix=["travellers","french"]', 'run_specialists=true', 'eval_fast_mode=true'])


class LaneMap(unittest.TestCase):
    def test_repo_lane_map_covers_every_scorable_item(self):
        lanes = efm.load_lane_map()
        self.assertEqual(set(lanes), set(efm.scorable_item_ids()))
        self.assertEqual(len(lanes), 24)
        for item, sel in lanes.items():
            self.assertTrue(2 <= len(sel) <= 3, item)
            efm.resolve_plan(','.join(sel), True)  # every entry is dispatchable

    def _write(self, items):
        d = tempfile.mkdtemp()
        p = Path(d) / 'map.json'
        p.write_text(json.dumps({'items': items}), encoding='utf-8')
        return p

    def test_invalid_maps_are_rejected(self):
        bad = [
            {'X': {'lanes': ['greek'], 'rationale': 'r'}},
            {'X': {'lanes': ['greek', 'mars'], 'rationale': 'r'}},
            {'X': {'lanes': ['greek', 'greek'], 'rationale': 'r'}},
            {'X': {'lanes': ['greek', 'french'], 'rationale': ' '}},
        ]
        for items in bad:
            with self.assertRaises(ValueError):
                efm.load_lane_map(self._write(items), eval_path=None)
        with self.assertRaises(ValueError):
            efm.load_lane_map(self._write({'X': {'lanes': ['greek', 'french'], 'rationale': 'r'}}))


class ValidationWarning(unittest.TestCase):
    def _report(self, status):
        root = Path(tempfile.mkdtemp())
        answer = root / '123' / 'research_answer'
        answer.mkdir(parents=True)
        (answer / 'validation_report.json').write_text(json.dumps({'status': status, 'blockers': ['CLAIM_REVIEWS_PENDING']}))
        return root, answer

    def test_incomplete_is_warning_with_marker(self):
        root, answer = self._report('INCOMPLETE')
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(efm.validation_warning('123', root), 0)
        self.assertIn('::warning', buf.getvalue())
        marker = json.loads((answer / 'eval_fast_mode.json').read_text())
        self.assertEqual(marker['validation_gate'], 'REPORTED_AS_WARNING')
        self.assertEqual(marker['blockers'], ['CLAIM_REVIEWS_PENDING'])

    def test_missing_report_still_fails(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(efm.validation_warning('999', Path(tempfile.mkdtemp())), 1)


class WorkflowWiring(unittest.TestCase):
    text = WORKFLOW.read_text(encoding='utf-8')

    def test_fast_mode_input_is_opt_in(self):
        self.assertIn('      eval_fast_mode:\n', self.text)
        block = self.text.split('      eval_fast_mode:\n', 1)[1].split('\n  push:', 1)[0]
        self.assertIn('default: false', block)
        self.assertIn("PCT_EVAL_FAST_MODE: ${{ inputs.eval_fast_mode == true && 'true' || 'false' }}", self.text)

    def test_production_validation_gate_kept(self):
        step = self.text.split('- name: Record actual validation even after failed or interrupted synthesis', 1)[1].split('- name:', 1)[0]
        self.assertIn("--require-complete", step)
        self.assertIn('if [ "$PCT_EVAL_FAST_MODE" = "true" ]', step)

    def test_caps_and_escalation_only_in_fast_mode(self):
        self.assertEqual(self.text.count("if: env.PCT_EVAL_FAST_MODE == 'true'"), 2)
        self.assertIn('${PCT_DISCOVERY_PASSES:-6}', self.text)
        self.assertIn("inputs.eval_fast_mode != true", self.text.split('jarvis-escalation-check:', 1)[1].split('steps:', 1)[0])


if __name__ == '__main__':
    unittest.main()
