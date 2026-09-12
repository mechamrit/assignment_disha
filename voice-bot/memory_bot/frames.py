"""Frames the game adds to the pipeline.

The read-out needs a reliable "the player has now heard every word" signal. Text-to-speech and the
output transport both forward non-audio frames in order behind the audio they follow, so a control
frame sent after the words arrives only once the words have actually played. These sentinels are
that signal: `PresentationStartFrame` goes in front of the sequence, `PresentationEndFrame` behind
it, and the tracker downstream of the transport turns them into gate callbacks.

An interruption clears the queues, so a start with no matching end means the read-out was cut off.
"""

from dataclasses import dataclass

from pipecat.frames.frames import ControlFrame


@dataclass
class PresentationStartFrame(ControlFrame):
    """Queued immediately before a sequence is spoken."""

    round_id: str = ""
    round_number: int = 0
    word_count: int = 0


@dataclass
class PresentationEndFrame(ControlFrame):
    """Queued immediately after a sequence is spoken; it arrives once the audio has played."""

    round_id: str = ""
    round_number: int = 0


@dataclass
class GameControlFrame(ControlFrame):
    """Starts the game once the browser says it is ready."""

    action: str = "start"
