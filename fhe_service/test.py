import tenseal as ts
print(f"TenSEAL version: {ts.__version__}")

# Test if the context creation and key loading methods exist
context = ts.context(ts.SCHEME_TYPE.CKKS, poly_modulus_degree=8192, coeff_mod_bit_sizes=[60, 40, 40, 60])

# This is the line that's been failing for you!
# It should NOT raise an AttributeError now.
if hasattr(context, 'load_public_key'):
    print("✓ 'context.load_public_key' method exists.")
else:
    print("✗ ERROR: 'context.load_public_key' method is still missing! Installation failed.")
    exit() # Stop here if it fails
    
if hasattr(context, 'load_relin_keys'):
    print("✓ 'context.load_relin_keys' method exists.")
else:
    print("✗ ERROR: 'context.load_relin_keys' method is still missing! Installation failed.")
    exit()
    
if hasattr(context, 'load_galois_keys'):
    print("✓ 'context.load_galois_keys' method exists.")
else:
    print("✗ ERROR: 'context.load_galois_keys' method is still missing! Installation failed.")
    exit()

print("TenSEAL environment check passed!")
exit() # Exit the interpreter