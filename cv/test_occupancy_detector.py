"""Offline regression tests for CV state tracking; no CV runtime or network required."""

from __future__ import annotations

import unittest

from occupancy_detector import StableChange, StableStateTracker


class StableStateTrackerTests(unittest.TestCase):
    def test_empty_tracker_accepts_first_observation_and_confirms_after_three(self) -> None:
        tracker = StableStateTracker(confirmation_frames=3)

        self.assertEqual(tracker.update({1: "FREE"}), [])
        self.assertIsNone(tracker.stable_states[1])
        self.assertEqual(tracker.update({1: "FREE"}), [])
        self.assertEqual(
            tracker.update({1: "FREE"}),
            [StableChange(slot_id=1, previous=None, current="FREE")],
        )
        self.assertEqual(tracker.stable_states[1], "FREE")

    def test_three_opposite_observations_create_one_state_change(self) -> None:
        tracker = StableStateTracker(confirmation_frames=3)
        for _ in range(3):
            tracker.update({1: "FREE"})

        self.assertEqual(tracker.update({1: "OCCUPIED"}), [])
        self.assertEqual(tracker.update({1: "OCCUPIED"}), [])
        self.assertEqual(
            tracker.update({1: "OCCUPIED"}),
            [StableChange(slot_id=1, previous="FREE", current="OCCUPIED")],
        )

    def test_noise_resets_confirmation_without_weakening_threshold(self) -> None:
        tracker = StableStateTracker([1], confirmation_frames=3)
        for _ in range(3):
            tracker.update({1: "FREE"})

        self.assertEqual(tracker.update({1: "OCCUPIED"}), [])
        self.assertEqual(tracker.update({1: "FREE"}), [])
        self.assertEqual(tracker.update({1: "OCCUPIED"}), [])
        self.assertEqual(tracker.update({1: "OCCUPIED"}), [])
        self.assertEqual(tracker.stable_states[1], "FREE")
        self.assertEqual(
            tracker.update({1: "OCCUPIED"}),
            [StableChange(slot_id=1, previous="FREE", current="OCCUPIED")],
        )

    def test_generator_initialization_and_p1_to_p8_are_independent(self) -> None:
        tracker = StableStateTracker((slot_id for slot_id in range(1, 9)), 3)
        expected_ids = set(range(1, 9))
        self.assertEqual(set(tracker.stable_states), expected_ids)
        self.assertEqual(set(tracker._candidates), expected_ids)
        self.assertEqual(set(tracker._counts), expected_ids)

        observations = {
            slot_id: "FREE" if slot_id % 2 else "OCCUPIED"
            for slot_id in range(1, 9)
        }
        self.assertEqual(tracker.update(observations), [])
        self.assertEqual(tracker.update(observations), [])
        changes = tracker.update(observations)
        self.assertEqual({change.slot_id for change in changes}, expected_ids)
        self.assertEqual(tracker.stable_states, observations)

    def test_string_slot_id_is_normalized_to_integer(self) -> None:
        tracker = StableStateTracker(confirmation_frames=3)
        tracker.update({"1": "FREE"})  # type: ignore[dict-item]
        self.assertEqual(set(tracker.stable_states), {1})


if __name__ == "__main__":
    unittest.main()
