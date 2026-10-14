"""Offline CPU embeddings from an explicitly supplied, already downloaded model."""
import argparse, gzip, hashlib, importlib.metadata, json, os, platform, time
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
p=argparse.ArgumentParser()
p.add_argument('inputs'); p.add_argument('model_directory'); p.add_argument('output_directory')
a=p.parse_args()
import numpy as np
import torch
from sentence_transformers import SentenceTransformer
sha=lambda b:hashlib.sha256(b).hexdigest()
data=json.loads(Path(a.inputs).read_text()); model_path=Path(a.model_directory)
out=Path(a.output_directory); assert out.is_dir()
assert not (out/'vectors.json').exists() and not (out/'vectors.f32.gz').exists(), 'Refusing to replace recorded vectors'
assert model_path.name=='e8f8c211226b894fcb81acc59f3b34ba3efd5f42'
torch.set_num_threads(4); torch.set_num_interop_threads(1)
m=SentenceTransformer(str(model_path),device='cpu',local_files_only=True,trust_remote_code=False)
assert m.max_seq_length==128 and m[0].auto_model.config.max_position_embeddings==512
m.max_seq_length=512
texts=[c['text'] for c in data['chunks']]
lengths=[len(m.tokenizer.encode(t,truncation=False)) for t in texts]
assert max(lengths)<=512, 'Input would truncate: stop before the experiment'
probe=['Кот спит на ковре.','Кошка лежит и спит на коврике.','Нужно собрать велосипед из деталей.']
pv=m.encode(probe,normalize_embeddings=True,show_progress_bar=False,convert_to_numpy=True)
probe_scores=[float(pv[0]@pv[1]),float(pv[0]@pv[2])]
assert probe_scores[0]>probe_scores[1], 'Russian smoke probe failed; do not proceed'
start=time.monotonic()
v=m.encode(texts,batch_size=8,normalize_embeddings=True,show_progress_bar=False,convert_to_numpy=True)
elapsed=time.monotonic()-start
assert v.shape==(len(texts),384) and np.isfinite(v).all()
assert np.allclose(np.linalg.norm(v,axis=1),1,atol=1e-5)
repeat=m.encode(texts[:1],normalize_embeddings=True,show_progress_bar=False,convert_to_numpy=True)
repeat_error=float(np.max(np.abs(repeat[0]-v[0])))
assert repeat_error<1e-5
raw=v.astype('<f4').tobytes(); packed=gzip.compress(raw,mtime=0)
model_files={str(f.relative_to(model_path)):sha(f.read_bytes()) for f in sorted(model_path.rglob('*')) if f.is_file()}
manifest={'model':'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2','revision':model_path.name,
 'license':'Apache-2.0','source':'https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
 'modelFileSha256':model_files,'protocolSha256':data['protocolSha256'],'dimensions':384,'device':'cpu','dtype':str(v.dtype),
 'defaultMaxSeqLength':128,'maxSeqLength':512,'normalization':'L2','pooling':'attention-mask mean, model packaged configuration',
 'batchSize':8,'torchThreads':4,'maxInputTokens':max(lengths),'inputsOverDefault128':sum(x>128 for x in lengths),'truncatedInputs':0,
 'probe':{'texts':probe,'relatedCosine':probe_scores[0],'unrelatedCosine':probe_scores[1],'scope':'one Russian smoke probe; not a quality benchmark'},
 'repeatMaxAbsoluteError':repeat_error,'encodingSeconds':elapsed,'networkPolicy':'HF_HUB_OFFLINE=1; TRANSFORMERS_OFFLINE=1; local_files_only=True; no HTTP in script','downloadPolicy':'disabled; existing snapshot only',
 'python':platform.python_version(),'packages':{n:importlib.metadata.version(n) for n in ['torch','transformers','sentence-transformers','numpy','safetensors','tokenizers']},
 'compressedSha256':sha(packed),'float32Sha256':sha(raw),'format':'gzip of row-major little-endian float32',
 'inputs':[{'path':c['path'],'ordinal':c['ordinal'],'sha256':sha(c['text'].encode()),'inputTokens':lengths[i]} for i,c in enumerate(data['chunks'])]}
(out/'vectors.f32.gz').write_bytes(packed); (out/'vectors.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['dimensions','maxInputTokens','inputsOverDefault128','truncatedInputs','probe','repeatMaxAbsoluteError','encodingSeconds']},ensure_ascii=False))
