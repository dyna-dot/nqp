# Copyright (C) 2009, Patrick R. Michaud
# $Id$

=head1 NAME

Regex::P6Regex - Parser/compiler for Perl 6 regexes

=head1 DESCRIPTION

=cut

.namespace ['Regex';'P6Regex';'Compiler']

.sub '' :anon :load :init
    load_bytecode 'PCT.pbc'
    .local pmc p6meta, p6regex
    p6meta = get_hll_global 'P6metaclass'
    p6regex = p6meta.'new_class'('Regex::P6Regex::Compiler', 'parent'=>'PCT::HLLCompiler')
    p6regex.'language'('Regex::P6Regex')
    $P0 = get_hll_namespace ['Regex';'P6Regex';'Grammar']
    p6regex.'parsegrammar'($P0)
    $P0 = get_hll_namespace ['Regex';'P6Regex';'Actions']
    p6regex.'parseactions'($P0)
.end

.sub 'main' :main
    .param pmc args_str

    $P0 = compreg 'Regex::P6Regex'
    $P1 = $P0.'command_line'(args_str, 'encoding'=>'utf8', 'transcode'=>'ascii iso-8859-1')
    exit 0
.end


# we have to overload PCT::HLLCompiler's parse method to support P6Regex grammars

.sub 'parse' :method
    .param pmc source
    .param pmc options         :slurpy :named

    .local pmc parsegrammar, parseactions, match
    parsegrammar = get_hll_global ['Regex';'P6Regex'], 'Grammar'
    $I0 = isa parsegrammar, ['Regex';'Cursor']
    unless $I0 goto parse_old

    parseactions = get_hll_global ['Regex';'P6Regex'], 'Actions'
    match = parsegrammar.'parse'(source, 'from'=>0, 'action'=>parseactions)
    unless match goto err_parsefail
    .return (match)

  err_parsefail:
    self.'panic'('Unable to parse source')
    .return (match)

  parse_old:
    $P0 = get_hll_global ['PCT'], 'HLLCompiler'
    $P1 = find_method $P0, 'parse'
    .tailcall self.$P1(source, options :flat :named)
.end


# these will eventually move to Regex.pir
.include 'src/PAST/Regex.pir'
.include 'src/PAST/Compiler-Regex.pir'
.include 'src/Regex/Cursor.pir'
.include 'src/Regex/Cursor-builtins.pir'
.include 'src/Regex/Match.pir'
.include 'src/Regex/Dumper.pir'
.include 'src/cheats/regex-cursor-protoregex.pir'

.include 'src/gen/p6regex-grammar.pir'
.include 'src/gen/p6regex-actions.pir'
.include 'src/cheats/PGE.pir'
.include 'src/cheats/p6regex-grammar.pir'

=cut

# Local Variables:
#   mode: pir
#   fill-column: 100
# End:
# vim: expandtab shiftwidth=4 ft=pir:
