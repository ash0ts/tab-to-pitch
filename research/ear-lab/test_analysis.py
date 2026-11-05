import unittest
from analysis import match,scores
class ScorerTests(unittest.TestCase):
    def test_one_reference_cannot_match_two_predictions(self):
        n={'midi':65,'start':0,'end':1}
        self.assertEqual(len(match([n,n],[n])),1)
        self.assertEqual(scores([n,n],[n])['precision'],.5)
    def test_wrong_octave_and_timing_fail(self):
        r={'midi':65,'start':0,'end':1}
        for p in [{**r,'midi':77},{**r,'start':.1}]:self.assertEqual(match([p],[r]),[])
    def test_offset_is_separate_and_pitch_classes_are_duration_based(self):
        r={'midi':65,'start':0,'end':1};p={**r,'end':.1}
        self.assertEqual(len(match([p],[r])),1);self.assertEqual(match([p],[r],True),[])
        self.assertLess(scores([p],[r])['pitchClassTimeIoU'],1)
if __name__=='__main__':unittest.main()
