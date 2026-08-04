"""Regression tests for the state_dict compatibility loader.

These exercise `_load_state_dict_compat` directly with tiny in-memory tensors —
no bundle download and no torch inference — so they stay fast. Heavy imports
(torch) are done LOCALLY per this package's import-safety convention.
"""

import collections

import pytest


def test_positional_remap_loads_renamed_keys():
    """A checkpoint with the SAME shapes/order but DIFFERENT key names (the
    spleen bundle's MONAI-version naming drift) loads via positional remap."""
    import torch
    from torch import nn

    from app.service.segmentation import _load_state_dict_compat

    net = nn.Linear(3, 2)  # network keys: "weight" [2,3], "bias" [2]
    # Same shapes and order, deliberately different names -> strict-by-name fails.
    renamed = collections.OrderedDict(
        [("legacy.kernel", torch.ones(2, 3)), ("legacy.offset", torch.ones(2))]
    )

    _load_state_dict_compat(net, renamed, "fake_bundle")

    assert torch.equal(net.weight.detach(), torch.ones(2, 3))
    assert torch.equal(net.bias.detach(), torch.ones(2))


def test_strict_by_name_is_preferred():
    """When the names already match, the strict path loads without remapping."""
    import torch
    from torch import nn

    from app.service.segmentation import _load_state_dict_compat

    net = nn.Linear(3, 2)
    state = collections.OrderedDict(
        [("weight", torch.ones(2, 3)), ("bias", torch.ones(2))]
    )

    _load_state_dict_compat(net, state, "fake_bundle")

    assert torch.equal(net.weight.detach(), torch.ones(2, 3))


def test_count_mismatch_raises():
    """A checkpoint with the wrong number of tensors fails loudly, never silently."""
    import torch
    from torch import nn

    from app.service.segmentation import _load_state_dict_compat

    net = nn.Linear(3, 2)
    too_few = collections.OrderedDict([("only", torch.ones(2, 3))])

    with pytest.raises(RuntimeError, match="fake_bundle"):
        _load_state_dict_compat(net, too_few, "fake_bundle")


def test_shape_mismatch_raises():
    """Matching count but a mismatched positional shape fails loudly."""
    import torch
    from torch import nn

    from app.service.segmentation import _load_state_dict_compat

    net = nn.Linear(3, 2)
    wrong_shape = collections.OrderedDict(
        [("a", torch.ones(5, 5)), ("b", torch.ones(2))]
    )

    with pytest.raises(RuntimeError, match="shape mismatch"):
        _load_state_dict_compat(net, wrong_shape, "fake_bundle")
