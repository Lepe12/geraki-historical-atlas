"""Hold explicit non-documentary genres as discovery leads, never delete them."""
import re
import unicodedata

def hold_reason(record):
    def text(value):
        if isinstance(value,list):value=' '.join(map(str,value))
        return ''.join(c for c in unicodedata.normalize('NFD',str(value or '')) if not unicodedata.combining(c)).casefold()
    creators=text(record.get('creator') or record.get('authors'))
    if re.search(r'claude\s*[/,&-]\s*anthropic|\bchatgpt\b|\bopenai\b|\bai[- ]generated\b|\bllm[- ]generated\b',creators):
        return 'DECLARED_GENERATIVE_AI_AUTHOR_REQUIRES_SOURCE_CHASE'
    title=text(record.get('title'));subjects=text(record.get('subject'))
    if (re.search(r'\b(?:melodramm[ao]|dramma lirico|commedia|libretto|ballo in|grammatica italiana|gramatica italiana|fantasy fiction|historical novel)\b',title)
        or re.search(r'\b(?:librettist|composer)\b',creators)
        or re.search(r'\b(?:fantasy fiction|historical fiction|librettos|musical drama)\b',subjects)):
        return 'EXPLICIT_FICTION_MUSICAL_OR_GRAMMAR_GENRE_NOT_EVENT_EVIDENCE'
    return None
